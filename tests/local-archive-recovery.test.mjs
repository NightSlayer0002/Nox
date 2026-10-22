import test from 'node:test';
import assert from 'node:assert/strict';
import {createKnowledge,KNOWLEDGE_KEY} from '../public/js/knowledge.js';
import {createAfterimageStore,AFTERIMAGE_STORAGE_KEY} from '../public/js/afterimage-store.js';
import {FIRST_CONTACT} from '../client/afterimage-example.js';

const disk=(key,raw)=>{const values=new Map(raw===undefined?[]:[[key,raw]]);return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};};
const story=title=>({packet:{...FIRST_CONTACT,title},seed:'A door',tone:'uncanny',source:'live'});

test('unreadable and future notebooks preserve their exact originals during temporary work',()=>{
  for(const raw of ['{broken',' {"version":9,"documents":[]} ',JSON.stringify({version:1,documents:[{id:'bad',title:4,text:'Valuable bytes'}]})]){
    const storage=disk(KNOWLEDGE_KEY,raw),book=createKnowledge(storage);
    const note=book.add({title:'Temporary',text:'Keep this new note.'});book.setEnabled(false);book.remove(note.id);
    assert.equal(storage.getItem(KNOWLEDGE_KEY),raw);
    assert.equal(book.exportOriginal(),raw);assert.ok(book.recovery);assert.equal(book.persistent,false);
  }
});

test('notebook replacement requires the confirmed original and retains temporary notes on a race',()=>{
  const storage=disk(KNOWLEDGE_KEY,'{original'),book=createKnowledge(storage);
  book.add({title:'Temporary',text:'Preserve my visit work.'});const confirmed=book.exportOriginal();
  const changed='{"version":2,"valuable":"Recovered elsewhere"}';storage.setItem(KNOWLEDGE_KEY,changed);
  assert.equal(book.resetOriginal(confirmed),false);assert.equal(storage.getItem(KNOWLEDGE_KEY),changed);
  assert.match(book.export(),/Preserve my visit work/);assert.equal(book.exportOriginal(),changed);
  assert.equal(book.resetOriginal(changed),true);assert.equal(book.recovery,null);
  assert.equal(createKnowledge(storage).list()[0].title,'Temporary');
});

test('unreadable and future story archives preserve originals during temporary edits and clear',()=>{
  for(const raw of ['{broken',' {"version":9,"receptions":[]} ',JSON.stringify({version:1,receptions:[{id:'bad',packet:{}}]})]){
    const storage=disk(AFTERIMAGE_STORAGE_KEY,raw),store=createAfterimageStore(storage);
    const entry=store.add(story('Temporary'));store.update(entry.id,{endingIndex:1});store.remove(entry.id);store.clear();
    assert.equal(storage.getItem(AFTERIMAGE_STORAGE_KEY),raw);
    assert.equal(store.exportOriginal(),raw);assert.ok(store.recovery);assert.equal(store.persistent,false);
  }
});

test('story replacement refuses changed originals without losing temporary stories',()=>{
  const storage=disk(AFTERIMAGE_STORAGE_KEY,'{original'),store=createAfterimageStore(storage);
  store.add(story('Temporary story'));const confirmed=store.exportOriginal();
  const changed='{"version":2,"valuable":"Original changed"}';storage.setItem(AFTERIMAGE_STORAGE_KEY,changed);
  assert.equal(store.resetOriginal(confirmed),false);assert.equal(storage.getItem(AFTERIMAGE_STORAGE_KEY),changed);
  assert.match(store.export(),/Temporary story/);assert.equal(store.exportOriginal(),changed);
  assert.equal(store.resetOriginal(changed),true);assert.equal(store.recovery,null);
  assert.equal(createAfterimageStore(storage).list()[0].packet.title,'Temporary story');
});

test('a confirmed recovered notebook merges saved and temporary notes',()=>{
  const storage=disk(KNOWLEDGE_KEY,'{original'),book=createKnowledge(storage);
  book.add({title:'Temporary',text:'Keep the temporary note.'});const original=book.exportOriginal();
  const recovered=createKnowledge(disk());recovered.add({title:'Recovered elsewhere',text:'Keep the recovered note.'});
  const valid=recovered.export();storage.setItem(KNOWLEDGE_KEY,valid);
  assert.equal(book.resetOriginal(original),false);assert.match(book.export(),/temporary note/);
  assert.equal(book.resetOriginal(book.exportOriginal()),true);
  assert.deepEqual(createKnowledge(storage).list().map(note=>note.title).sort(),['Recovered elsewhere','Temporary']);
});

test('a confirmed recovered story archive merges saved and temporary stories',()=>{
  const storage=disk(AFTERIMAGE_STORAGE_KEY,'{original'),store=createAfterimageStore(storage);
  store.add(story('Temporary'));const original=store.exportOriginal();
  const recovered=createAfterimageStore(disk());recovered.add(story('Recovered elsewhere'));
  storage.setItem(AFTERIMAGE_STORAGE_KEY,recovered.export());
  assert.equal(store.resetOriginal(original),false);assert.match(store.export(),/Temporary/);
  assert.equal(store.resetOriginal(store.exportOriginal()),true);
  assert.deepEqual(createAfterimageStore(storage).list().map(item=>item.packet.title).sort(),['Recovered elsewhere','Temporary']);
});

test('noncanonical saved story IDs protect the original instead of becoming duplicate IDs',()=>{
  const source=createAfterimageStore(disk()),entry=source.add(story('Saved'));
  const raw=JSON.stringify({version:1,receptions:[{...entry,id:` ${entry.id}`}]}),storage=disk(AFTERIMAGE_STORAGE_KEY,raw),store=createAfterimageStore(storage);
  assert.ok(store.recovery);store.add(story('Temporary'));assert.equal(storage.getItem(AFTERIMAGE_STORAGE_KEY),raw);
});

test('a full story archive rejects additions without deleting any custom story',()=>{
  const storage=disk(),store=createAfterimageStore(storage);
  for(let i=0;i<12;i++)store.add(story(`Custom ${i}`));
  const original=store.export(),raw=storage.getItem(AFTERIMAGE_STORAGE_KEY);
  assert.throws(()=>store.add(story('Would evict a custom story')),/12|full/i);
  assert.equal(store.export(),original);assert.equal(storage.getItem(AFTERIMAGE_STORAGE_KEY),raw);
  store.remove(store.list()[0].id);assert.ok(store.add(story('Room after explicit deletion')));
});

test('loading an oversized existing story archive never prunes its stories',()=>{
  const source=createAfterimageStore(disk());for(let i=0;i<12;i++)source.add(story(`Custom ${i}`));
  const saved=JSON.parse(source.export());saved.receptions.push({...saved.receptions[0],id:'extra-existing-story'});
  const storage=disk(AFTERIMAGE_STORAGE_KEY,JSON.stringify(saved)),store=createAfterimageStore(storage);
  assert.equal(store.list().length,13);store.update(store.list()[0].id,{endingIndex:1});
  assert.equal(JSON.parse(storage.getItem(AFTERIMAGE_STORAGE_KEY)).receptions.length,13);
});
