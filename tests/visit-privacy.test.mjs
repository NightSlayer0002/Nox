import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisitScope} from '../public/js/visit-storage.js';
import {createHistory} from '../public/js/history.js';
const disk=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
test('guest scope never reads an owner archive and a refresh gets empty temporary storage',async()=>{
  const storage=disk(),owner=createVisitScope({owner:true,storage}),archive=await createHistory(owner.storage);await archive.append('user','PRIVATE OWNER NOTE');
  let reads=0;const observed={...storage,getItem:k=>{reads++;return storage.getItem(k);}};
  const guest=createVisitScope({owner:false,storage:observed}),history=await createHistory(guest.storage);assert.equal(reads,0);assert.equal(history.persistent,false);assert.equal(history.active().turns.length,0);
  await history.append('user','A guest thought');assert.equal(history.active().turns.length,1);
  const refreshed=await createHistory(createVisitScope({owner:false,storage}).storage);assert.equal(refreshed.active().turns.length,0);
  assert.equal((await createHistory(owner.storage)).active().turns[0].content,'PRIVATE OWNER NOTE');
});
test('explicit guest visit stays temporary even if an owner session exists',()=>{
  const storage=disk();storage.setItem('private','secret');const guest=createVisitScope({owner:true,guest:true,storage});assert.equal(guest.owner,false);assert.equal(guest.storage.getItem('private'),null);guest.storage.setItem('private','visitor');assert.equal(storage.getItem('private'),'secret');
});
test('owner storage restrictions fall back to temporary storage without dropping owner authorization',()=>{
  const scope=createVisitScope({owner:true,storage:null});assert.equal(scope.owner,true);assert.equal(scope.storage.temporary,true);
});
