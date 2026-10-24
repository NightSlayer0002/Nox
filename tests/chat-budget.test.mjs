import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatBudget} from '../server/chat-budget.mjs';
import {requestFreeChat,FREE_CHAT_MODEL} from '../server/free-model-policy.mjs';
test('one overall deadline stops a pending attempt even when a provider ignores cancellation',async()=>{
  let time=0,expire,signal,calls=0;
  const pending=requestFreeChat({}, {model:FREE_CHAT_MODEL,now:()=>time,setTimer:callback=>{expire=callback;return 1;},clearTimer(){},request:async(_,options)=>{calls++;signal=options.signal;return new Promise(()=>{});}});
  await Promise.resolve();await Promise.resolve();
  assert.equal(calls,1);time=26000;expire();
  await assert.rejects(pending,error=>error.name==='TimeoutError');
  assert.equal(signal.aborted,true);assert.equal(calls,1);
});
test('late partial speech cannot trigger a fallback or emit after the total deadline',async()=>{
  let time=0,expire;const seen=[];let emit,calls=0;
  const pending=requestFreeChat({}, {model:FREE_CHAT_MODEL,now:()=>time,setTimer:callback=>{expire=callback;return 1;},clearTimer(){},onText:text=>seen.push(text),request:async(_,options)=>{calls++;emit=options.onText;emit('First part');return new Promise(()=>{});}});
  await Promise.resolve();await Promise.resolve();time=26000;expire();
  await assert.rejects(pending,error=>error.name==='TimeoutError');
  assert.throws(()=>emit('Stale ending'),error=>error.name==='TimeoutError');
  assert.deepEqual(seen,['First part']);assert.equal(calls,1);
});
test('completed budgets remove timers and caller cancellation listeners',async()=>{
  const controller=new AbortController();let cleared=0;
  const budget=createChatBudget({signal:controller.signal,setTimer:()=>17,clearTimer:timer=>{assert.equal(timer,17);cleared++;}});
  assert.equal(await budget.run(()=>42),42);budget.dispose();controller.abort();
  assert.equal(budget.signal.aborted,false);assert.equal(cleared,1);
});
