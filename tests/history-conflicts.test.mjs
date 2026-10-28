import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistory} from '../public/js/history.js';
const disk=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
// Capture once when the user opens the operation, before the other writer acts.
const target=(history,seq,role='user')=>history.revisionTarget(seq,{role});
const summarize=(history,work,text,options)=>history.applySummary(work,text,options);
async function dialogue(history){await history.append('user','Original question');await history.append('assistant','Original answer');}

test('an old edit cannot overwrite a newer correction or its following answer',async()=>{
  const storage=disk(),a=await createHistory(storage);await dialogue(a);const edit=target(a,1);
  const b=await createHistory(storage);await b.replaceFrom(target(b,1),'Newer correction');await b.append('assistant','Newer answer');
  const saved=storage.getItem('nox.chats.v1');assert.equal(await a.replaceFrom(edit,'Stale correction'),null);
  assert.equal(storage.getItem('nox.chats.v1'),saved);assert.equal(a.lastError,'revision-conflict');
});
test('deleting the edited thread cannot redirect its edit into another conversation',async()=>{
  const storage=disk(),a=await createHistory(storage);await dialogue(a);const original=a.active().id,edit=target(a,1);
  await a.create();await a.append('user','Beta must survive');await a.select(original);
  const b=await createHistory(storage);await b.remove(original);await a.refresh();const saved=storage.getItem('nox.chats.v1');
  assert.equal(await a.replaceFrom(edit,'An edit intended for Alpha'),null);assert.equal(storage.getItem('nox.chats.v1'),saved);
  assert.equal(a.active().turns[0].content,'Beta must survive');
});
test('Retry rejects a stale view after another tab appends new work',async()=>{
  const storage=disk(),a=await createHistory(storage);await dialogue(a);const retry=target(a,2,'assistant');
  const b=await createHistory(storage);await b.append('user','A newer question');await b.append('assistant','A newer answer');
  const saved=storage.getItem('nox.chats.v1');assert.equal(await a.retryFrom(retry),null);assert.equal(storage.getItem('nox.chats.v1'),saved);
});
test('an old summary cannot enter a replacement branch with reused sequence numbers',async()=>{
  const storage=disk(),a=await createHistory(storage);for(let i=0;i<20;i++)await a.append(i%2?'assistant':'user',`Old turn ${i}`);
  const work=a.summaryWork(),b=await createHistory(storage);await b.replaceFrom(target(b,9),'A different direction');
  for(let i=9;i<20;i++)await b.append(i%2?'assistant':'user',`Replacement turn ${i}`);
  const saved=storage.getItem('nox.chats.v1');assert.equal(await summarize(a,work,'Deleted branch instructions'),false);assert.equal(storage.getItem('nox.chats.v1'),saved);
});
test('a summary still applies after an ordinary append outside its captured prefix',async()=>{
  const storage=disk(),a=await createHistory(storage);for(let i=0;i<20;i++)await a.append(i%2?'assistant':'user',`Turn ${i}`);
  const work=a.summaryWork(),b=await createHistory(storage);await b.append('user','A later question');
  assert.equal(await a.applySummary(work,'A valid summary'),true);assert.equal(a.active().turns.at(-1).content,'A later question');
});
test('summary cancellation is rechecked after its commit waits for a lock',async()=>{
  const storage=disk(),history=await createHistory(storage);for(let i=0;i<20;i++)await history.append(i%2?'assistant':'user',`Turn ${i}`);
  const work=history.summaryWork(),saved=storage.getItem('nox.chats.v1'),controller=new AbortController(),descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');let release;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:(_name,commit)=>new Promise(resolve=>{release=()=>resolve(commit());})}}});
  try{const saving=history.applySummary(work,'An obsolete summary',{signal:controller.signal});controller.abort();release();assert.equal(await saving,false);assert.equal(storage.getItem('nox.chats.v1'),saved);}
  finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
});
test('legacy turn identities remain stable across reloads and edits',async()=>{
  const storage=disk();storage.setItem('nox.chats.v1',JSON.stringify({version:1,active:'legacy',threads:[{id:'legacy',mode:'companion',turns:[{role:'user',content:'Legacy question',seq:1},{role:'assistant',content:'Legacy answer',seq:2}]}]}));
  const a=await createHistory(storage),b=await createHistory(storage),original=a.active().turns[0].id;
  assert.equal(b.active().turns[0].id,original);await a.replaceFrom(target(a,1),'A corrected legacy question');
  assert.equal((await createHistory(storage)).active().turns[0].id,original);
});
for(const operation of ['rejected retry','summary commit'])test(`a ${operation} announces an external transcript loaded before its storage event`,async()=>{
  const storage=disk(),a=await createHistory(storage);for(let i=0;i<20;i++)await a.append(i%2?'assistant':'user',`Turn ${i}`);
  const retry=target(a,20,'assistant'),work=a.summaryWork(),events=[];a.subscribe(event=>events.push(event));
  const b=await createHistory(storage);await b.append('user','Newer question');await b.append('assistant','Newer answer');
  if(operation==='rejected retry')assert.equal(await a.retryFrom(retry),null);else assert.equal(await a.applySummary(work,'A valid older summary'),true);
  assert.ok(events.some(event=>event.currentChanged),'the displayed transcript must be invalidated during reload');
  await a.refresh();assert.equal(a.active().turns.length,22);
});
