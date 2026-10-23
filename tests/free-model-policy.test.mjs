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
