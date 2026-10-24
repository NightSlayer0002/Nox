import test from 'node:test';
import assert from 'node:assert/strict';
import {createKnowledge, KNOWLEDGE_KEY} from '../public/js/knowledge.js';
import {createAfterimageStore, AFTERIMAGE_STORAGE_KEY} from '../public/js/afterimage-store.js';
import {FIRST_CONTACT} from '../client/afterimage-example.js';

const note=title=>({title,text:`Keep ${title}.`});
const story=title=>({packet:{...FIRST_CONTACT,title},seed:'A door',tone:'uncanny',source:'live'});
function disk(){const data=new Map();let hook;return {getItem(key){const raw=data.get(key)??null;const callback=hook;hook=null;callback?.();return raw;},setItem:(key,value)=>data.set(key,value),onRead(fn){hook=fn;}};}
// Same exclusive ordering as Web Locks, with an injected storage-read yield that
// reproduces a second tab entering between the original read and write.
function locks(){const tails=new Map();return {request(name,callback){const job=(tails.get(name)||Promise.resolve()).then(callback);tails.set(name,job.catch(()=>{}));return job;}};}

test('a notebook delete cannot be revived by an overlapping context toggle',async()=>{
  const storage=disk(),options={locks:locks()},one=createKnowledge(storage,options),two=createKnowledge(storage,options);
  const saved=await one.add(note('Delete me'));let deletion;
  storage.onRead(()=>{deletion=one.remove(saved.id);});await two.setEnabled(false);await deletion;
  assert.deepEqual(createKnowledge(storage).list(),[]);assert.equal(two.enabled,false);
});

test('an overlapping story add cannot restore a deleted reception',async()=>{
  const storage=disk(),options={locks:locks()},one=createAfterimageStore(storage,options),two=createAfterimageStore(storage,options);
  const saved=await one.add(story('Delete me'));let deletion;
  storage.onRead(()=>{deletion=one.remove(saved.id);});await two.add(story('Keep me'));await deletion;
  assert.deepEqual(createAfterimageStore(storage).list().map(item=>item.packet.title),['Keep me']);
});

test('overlapping independent story edits both survive',async()=>{
  const storage=disk(),options={locks:locks()},one=createAfterimageStore(storage,options),two=createAfterimageStore(storage,options);
  const saved=await one.add(story('Independent edits'));let otherEdit;
  storage.onRead(()=>{otherEdit=two.update(saved.id,{endingIndex:1});});await one.update(saved.id,{signalIndex:1});await otherEdit;
  const restored=createAfterimageStore(storage).get(saved.id);assert.equal(restored.signalIndex,1);assert.equal(restored.endingIndex,1);
});

for(const kind of ['notebook','stories'])test(`${kind} recovery replacement and a concurrent new item keep both successful writes`,async()=>{
  const storage=disk(),options={locks:locks()},key=kind==='notebook'?KNOWLEDGE_KEY:AFTERIMAGE_STORAGE_KEY;
  const make=()=>kind==='notebook'?createKnowledge(storage,options):createAfterimageStore(storage,options),input=kind==='notebook'?note:story;
  storage.setItem(key,'{unreadable');const protectedStore=make();await protectedStore.add(input('Visit work'));
  storage.setItem(key,kind==='notebook'?'\u007b"version":1,"enabled":true,"documents":[]}':'\u007b"version":1,"receptions":[]}');
  const expected=protectedStore.exportOriginal(),writer=make();let addition;
  storage.onRead(()=>{addition=writer.add(input('Concurrent work'));});assert.equal(await protectedStore.resetOriginal(expected),true);await addition;
  const names=make().list().map(item=>item.title||item.packet.title).sort();assert.deepEqual(names,['Concurrent work','Visit work']);
});

test('failed saved-story deletion returns not committed and retains the visible durable item for retry',async()=>{
  const storage=disk(),store=createAfterimageStore(storage),saved=await store.add(story('Only copy')),original=storage.getItem(AFTERIMAGE_STORAGE_KEY),write=storage.setItem;
  storage.setItem=()=>{throw Error('Quota blocked');};const failed=await store.remove(saved.id);
  assert.equal(failed.committed,false);assert.equal(failed.removed,false);assert.match(failed.error,/could not|storage/i);
  assert.equal(store.list()[0].id,saved.id);assert.equal(storage.getItem(AFTERIMAGE_STORAGE_KEY),original);
  assert.equal(createAfterimageStore(storage).list()[0].id,saved.id);
  storage.setItem=write;const retried=await store.remove(saved.id);assert.equal(retried.committed,true);assert.equal(retried.removed,true);assert.deepEqual(createAfterimageStore(storage).list(),[]);
});

test('without origin-wide locking browser owner stores preserve bytes and refuse unsafe writes',()=>{
  const storage=disk(),book=createKnowledge(storage,{locks:null,browser:true}),stories=createAfterimageStore(storage,{locks:null,browser:true});
  assert.throws(()=>book.add(note('Unsafe')),/locking|browser/i);assert.throws(()=>stories.add(story('Unsafe')),/locking|browser/i);
  assert.equal(storage.getItem(KNOWLEDGE_KEY),null);assert.equal(storage.getItem(AFTERIMAGE_STORAGE_KEY),null);
});

test('isolated guest storage remains writable without Web Locks and never touches owner bytes',async()=>{
  const storage=disk();storage.temporary=true;const book=createKnowledge(storage,{locks:null,browser:true}),stories=createAfterimageStore(storage,{locks:null,browser:true});
  await book.add(note('Visit'));const saved=await stories.add(story('Visit'));assert.equal(book.persistent,false);assert.equal(stories.persistent,false);
  const result=await stories.remove(saved.id);assert.equal(result.scope,'visit');assert.equal(result.committed,true);
});

test('losing storage read access cannot turn a saved-story deletion into a temporary-only disappearance',async()=>{
  const storage=disk(),store=createAfterimageStore(storage),saved=await store.add(story('Saved copy')),raw=storage.getItem(AFTERIMAGE_STORAGE_KEY);
  storage.getItem=()=>{throw Error('Blocked reads');};const result=await store.remove(saved.id);
  assert.equal(result.committed,false);assert.equal(result.removed,false);assert.equal(result.scope,'browser');assert.match(result.error,/saved|storage/i);assert.equal(store.list()[0].id,saved.id);
  assert.match(raw,/Saved copy/);
});

test('losing notebook read access refuses saved-note deletion while new visit notes remain removable',()=>{
  const storage=disk(),book=createKnowledge(storage),saved=book.add(note('Saved copy')),raw=storage.getItem(KNOWLEDGE_KEY);
  storage.getItem=()=>{throw Error('Blocked reads');};assert.throws(()=>book.remove(saved.id),/could not|storage/i);
  assert.equal(book.list()[0].id,saved.id);assert.match(raw,/Saved copy/);
  const temporary=book.add(note('Visit only'));assert.equal(book.remove(temporary.id),true);assert.equal(book.list().length,1);
});
