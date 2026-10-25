import test from 'node:test';
import assert from 'node:assert/strict';
import {createAfterimageStore,AFTERIMAGE_STORAGE_KEY} from '../public/js/afterimage-store.js';
import {FIRST_CONTACT} from '../client/afterimage-example.js';

function fixture(){
  const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  const first=createAfterimageStore(storage),second=createAfterimageStore(storage);
  const original=first.add({packet:FIRST_CONTACT,seed:'A synthetic door',tone:'uncanny',source:'authored'});
  return {storage,first,second,original};
}
const lines=['One original line.','Another original line.','A third original line.','The original ending.'];

test('a stale story edit cannot be combined with another tab’s changed branch',()=>{
  const {first,second,original}=fixture();
  const latest=second.update(original.id,{signalIndex:1},{expectedRevision:original.revision});
  assert.throws(()=>first.update(original.id,{editedLines:lines},{expectedRevision:original.revision}),{code:'story_conflict'});
  assert.deepEqual(first.get(original.id),latest);
  assert.equal(first.get(original.id).editedLines,undefined);
});

test('a concurrent line edit and an away-and-back branch change both invalidate stale cuts',()=>{
  for(const change of ['lines','branch']){
    const {first,second,original}=fixture();
    if(change==='lines')second.update(original.id,{editedLines:lines},{expectedRevision:original.revision});
    else{const away=second.update(original.id,{signalIndex:1},{expectedRevision:original.revision});second.update(original.id,{signalIndex:0},{expectedRevision:away.revision});}
    const before=first.export();
    assert.throws(()=>first.update(original.id,{endingIndex:1},{expectedRevision:original.revision}),{code:'story_conflict'});
    assert.equal(first.export(),before);
  }
});

test('older archives start at revision zero and reviewed edits use the latest revision',()=>{
  const {storage,first,second,original}=fixture();
  const archive=JSON.parse(storage.getItem(AFTERIMAGE_STORAGE_KEY));delete archive.receptions[0].revision;
  storage.setItem(AFTERIMAGE_STORAGE_KEY,JSON.stringify(archive));
  const legacy=first.get(original.id);assert.equal(legacy.revision,0);
  const reviewed=second.update(original.id,{signalIndex:2},{expectedRevision:legacy.revision});
  const saved=first.update(original.id,{editedLines:lines},{expectedRevision:reviewed.revision});
  assert.equal(saved.signalIndex,2);assert.deepEqual(saved.editedLines,lines);assert.equal(saved.revision,reviewed.revision+1);
  assert.equal(createAfterimageStore(storage).get(original.id).revision,saved.revision);
});

test('deletion while an edit waits returns missing without reviving the story',async()=>{
  const {storage,first,original}=fixture();let release;
  const waiting=createAfterimageStore(storage,{locks:{request:(_,operation)=>new Promise(resolve=>{release=()=>resolve(operation());})}});
  const pending=waiting.update(original.id,{editedLines:lines},{expectedRevision:original.revision});
  first.remove(original.id);release();assert.equal(await pending,null);assert.equal(first.get(original.id),null);
});
