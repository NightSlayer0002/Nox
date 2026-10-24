import test from 'node:test';
import assert from 'node:assert/strict';
import {FREE_CHAT_MODEL,FREE_CHAT_FALLBACK,requestFreeChat} from '../server/free-model-policy.mjs';
const packet={speech:'A complete answer.',emotion:'curious',action:'none',memory:''};
test('the production free default is 120B and successful replies consume one request',async()=>{
  assert.equal(FREE_CHAT_MODEL,'openai/gpt-oss-120b');assert.equal(FREE_CHAT_FALLBACK,'openai/gpt-oss-20b');
  const models=[],metrics=[];
  assert.equal(await requestFreeChat({message:'Hello'},{model:FREE_CHAT_MODEL,onModel:(...value)=>metrics.push(value),request:async(_,options)=>{models.push(options.model);return packet;}}),packet);
  assert.deepEqual(models,[FREE_CHAT_MODEL]);assert.deepEqual(metrics,[[FREE_CHAT_MODEL,null]]);
});
test('only quota and unavailable model errors get one reported free fallback',async()=>{
  for(const code of ['quota','model_access']){
    const models=[],metrics=[];
    await requestFreeChat({message:'Hello'},{model:FREE_CHAT_MODEL,onModel:(...value)=>metrics.push(value),request:async(_,options)=>{models.push(options.model);if(models.length===1)throw Object.assign(Error('Unavailable'),{code});return packet;}});
    assert.deepEqual(models,[FREE_CHAT_MODEL,FREE_CHAT_FALLBACK]);assert.deepEqual(metrics.at(-1),[FREE_CHAT_FALLBACK,code]);
  }
});
test('provider, credentials and malformed output failures never create extra requests',async()=>{
  for(const code of ['credentials','invalid_json','provider_http','output_limit']){
    let calls=0;await assert.rejects(requestFreeChat({}, {model:FREE_CHAT_MODEL,request:async()=>{calls++;throw Object.assign(Error(code),{code});}}));assert.equal(calls,1);
  }
});
test('fallback failure is final and partial output cannot switch models',async()=>{
  let calls=0;await assert.rejects(requestFreeChat({}, {model:FREE_CHAT_MODEL,request:async()=>{calls++;throw Object.assign(Error('quota'),{code:'quota'});}}));assert.equal(calls,2);
  calls=0;await assert.rejects(requestFreeChat({}, {model:FREE_CHAT_MODEL,onText:()=>{},request:async(_,options)=>{calls++;options.onText('Started answer');throw Object.assign(Error('quota'),{code:'quota'});}}));assert.equal(calls,1);
});
test('aborted work never calls a provider or falls back',async()=>{
  const controller=new AbortController();controller.abort();let calls=0;
  await assert.rejects(requestFreeChat({}, {model:FREE_CHAT_MODEL,signal:controller.signal,request:async()=>{calls++;return packet;}}));assert.equal(calls,0);
});
test('late primary quota failures do not start a fallback without four seconds remaining',async()=>{
  let time=1000,calls=0;
  await assert.rejects(requestFreeChat({}, {model:FREE_CHAT_MODEL,now:()=>time,request:async()=>{calls++;time+=23000;throw Object.assign(Error('Quota'),{code:'quota'});}}),error=>error.code==='quota');
  assert.equal(calls,1);
});
test('fallback shares the original deadline and receives only the remaining time',async()=>{
  let time=1000;const options=[];
  await requestFreeChat({}, {model:FREE_CHAT_MODEL,now:()=>time,request:async(_,value)=>{options.push(value);if(options.length===1){time+=19000;throw Object.assign(Error('Quota'),{code:'quota'});}return packet;}});
  assert.equal(options[0].deadlineAt,27000);assert.equal(options[1].deadlineAt,27000);
  assert.equal(options[1].deadlineAt-time,7000);
});
test('disconnect after a retryable failure cancels before another provider request',async()=>{
  const controller=new AbortController();let calls=0;
  await assert.rejects(requestFreeChat({}, {model:FREE_CHAT_MODEL,signal:controller.signal,request:async()=>{calls++;controller.abort();throw Object.assign(Error('Quota'),{code:'quota'});}}));
  assert.equal(calls,1);
});
