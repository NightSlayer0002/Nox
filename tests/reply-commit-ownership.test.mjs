import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistory} from '../public/js/history.js';

const disk=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
async function queued(run){
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator'),waiting=[];
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:(_name,action)=>new Promise((resolve,reject)=>waiting.push(()=>{try{resolve(action());}catch(error){reject(error);}}))}}});
  try{await run(()=>{assert.ok(waiting.length,'a real store transaction is waiting');waiting.shift()();});}
  finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
}

for(const change of ['edit','retry','delete','append'])test(`a queued answer cannot enter a conversation after ${change}`,async()=>{
  // Question: Is the captured user turn/frontier revalidated inside the final write, after another writer wins?
  // Limits: Real history transactions with a controlled lock scheduler; not native browser events, model quality or every possible interleaving.
  const storage=disk(),a=await createHistory(storage);await a.append('user','Original question');
  const replyTo=a.revisionTarget(1),b=await createHistory(storage);
  await queued(async release=>{
    const replacement=change==='edit'?b.replaceFrom(b.revisionTarget(1),'Replacement question'):
      change==='retry'?b.retryFrom(b.revisionTarget(1)):
      change==='delete'?b.remove(b.active().id):b.append('user','Another question');
    const answer=a.append('assistant','Obsolete answer to the original question',{replyTo});
    release();await replacement;const saved=storage.getItem('nox.chats.v1');release();
    assert.equal(await answer,false);assert.equal(storage.getItem('nox.chats.v1'),saved);
    assert.equal(JSON.parse(saved).threads.some(t=>t.turns.some(v=>v.content==='Obsolete answer to the original question')),false);
  });
});

test('Stop while an answer waits for storage prevents that answer from committing',async()=>{
  // Question: Does cancellation remain effective after inference but before the final storage lock?
  // Limits: AbortSignal and real store; does not establish provider billing cancellation or physical Stop interaction.
  const storage=disk(),history=await createHistory(storage);await history.append('user','Keep the question');
  const replyTo=history.revisionTarget(1),controller=new AbortController(),saved=storage.getItem('nox.chats.v1');
  await queued(async release=>{const answer=history.append('assistant','Canceled answer',{replyTo,signal:controller.signal});controller.abort();release();assert.equal(await answer,false);});
  assert.equal(storage.getItem('nox.chats.v1'),saved);
});

test('a scoped answer saves once and rejects a duplicate completion',async()=>{
  // Question: Can one saved question receive its valid completion without letting the same obsolete frontier commit twice?
  // Limits: Store-level exactly-once frontier, not network delivery or generated answer correctness.
  const history=await createHistory(disk());await history.append('user','Current question');const replyTo=history.revisionTarget(1);
  assert.equal(await history.append('assistant','Current answer',{replyTo}),true);
  assert.equal(await history.append('assistant','Duplicate answer',{replyTo}),false);
  assert.deepEqual(history.active().turns.map(v=>v.content),['Current question','Current answer']);
});

test('a valid summary update outside the answer frontier does not discard the answer',async()=>{
  // Question: Does harmless summary metadata unnecessarily invalidate an otherwise unchanged saved question?
  // Limits: One bounded real summary batch; no claim that all original messages fit active model context.
  const history=await createHistory(disk());for(let i=0;i<21;i++)await history.append(i%2?'assistant':'user',`Turn ${i}`);
  const replyTo=history.revisionTarget(21),work=history.summaryWork();assert.ok(work);
  assert.equal(await history.applySummary(work,'Valid older summary'),true);
  assert.equal(await history.append('assistant','Answer to turn 20',{replyTo}),true);
});
