import test from 'node:test';
import assert from 'node:assert/strict';
import * as speech from '../server/speech.mjs';
import {fixtureWav} from './helpers/wav.mjs';
import {createCache} from '../server/cache.mjs';

test('progressive speech yields the first finished ordered segment without adding synthesis requests',async()=>{
  assert.equal(typeof speech.requestSpeechClips,'function');
  const requests=[],cache=createCache();
  const options={provider:'groq',apiKey:'fixture',voice:'troy',clipCache:cache,fetchImpl:(_url,options)=>new Promise(resolve=>requests.push({body:JSON.parse(options.body),resolve}))};
  const input={text:'word '.repeat(50).trim(),emotion:'happy'};
  const clips=speech.requestSpeechClips(input,options),first=clips.next();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests.length,2);
  assert.ok(requests.every(request=>request.body.input.length<=200));
  requests[0].resolve(new Response(fixtureWav([101]),{headers:{'content-type':'audio/wav'}}));
  const firstResult=await first;
  assert.equal(firstResult.done,false);
  assert.equal(firstResult.value.readInt16LE(44),101);
  requests[1].resolve(new Response(fixtureWav([202]),{headers:{'content-type':'audio/wav'}}));
  const secondResult=await clips.next();
  assert.equal(secondResult.value.readInt16LE(44),202);
  assert.equal((await clips.next()).done,true);
  const combined=await speech.requestSpeech(input,options);
  assert.equal(requests.length,2);
  assert.equal(combined.readInt16LE(44),101);
  assert.equal(combined.readInt16LE(46),202);
});

test('progressive speech keeps the original order when a later clip finishes first',async()=>{
  const requests=[];
  const clips=speech.requestSpeechClips({text:'word '.repeat(50).trim()},{provider:'groq',apiKey:'fixture',fetchImpl:()=>new Promise(resolve=>requests.push(resolve))});
  let settled=false;
  const first=clips.next().then(result=>{settled=true;return result;});
  await new Promise(resolve=>setImmediate(resolve));
  requests[1](new Response(fixtureWav([202]),{headers:{'content-type':'audio/wav'}}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(settled,false);
  requests[0](new Response(fixtureWav([101]),{headers:{'content-type':'audio/wav'}}));
  assert.equal((await first).value.readInt16LE(44),101);
  assert.equal((await clips.next()).value.readInt16LE(44),202);
  assert.equal((await clips.next()).done,true);
});

test('progressive speech bounds the total output and handles failures from later concurrent requests',async()=>{
  const requests=[];
  const clips=speech.requestSpeechClips({text:'word '.repeat(50).trim()},{provider:'groq',apiKey:'fixture',fetchImpl:()=>new Promise(resolve=>requests.push(resolve))});
  const first=clips.next();
  await new Promise(resolve=>setImmediate(resolve));
  requests[1](new Response(new Uint8Array(1200000),{headers:{'content-type':'audio/wav'}}));
  await new Promise(resolve=>setImmediate(resolve));
  requests[0](new Response(new Uint8Array(1200000),{headers:{'content-type':'audio/wav'}}));
  await assert.rejects(first,/too large/i);
});

test('progressive speech accepts a caller cancellation signal for every same-plan synthesis request',async()=>{
  const controller=new AbortController(),signals=[];
  const clips=speech.requestSpeechClips({text:'word '.repeat(50).trim()},{provider:'groq',apiKey:'fixture',signal:controller.signal,fetchImpl:(_url,options)=>new Promise((_resolve,reject)=>{signals.push(options.signal);options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});})});
  const first=clips.next();
  assert.equal(signals.length,2);
  controller.abort();
  assert.ok(signals.every(signal=>signal.aborted));
  await assert.rejects(first,{name:'AbortError'});
});

test('cancelling one cached caller does not abort synthesis shared with another active caller',async()=>{
  const clipCache=createCache(),firstController=new AbortController(),secondController=new AbortController(),requests=[];
  const options={provider:'groq',apiKey:'fixture',clipCache,fetchImpl:(_url,options)=>new Promise((resolve,reject)=>{
    requests.push({resolve,signal:options.signal});
    options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});
  })};
  const first=speech.requestSpeechClips({text:'Shared audio.'},{...options,signal:firstController.signal}).next();
  const second=speech.requestSpeechClips({text:'Shared audio.'},{...options,signal:secondController.signal}).next().then(result=>({result}),error=>({error}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests.length,1);
  firstController.abort();
  await assert.rejects(first,{name:'AbortError'});
  assert.equal(requests[0].signal.aborted,false);
  requests[0].resolve(new Response(fixtureWav([101]),{headers:{'content-type':'audio/wav'}}));
  const active=await second;
  assert.equal(active.error,undefined);
  assert.equal(active.result.value.readInt16LE(44),101);
});

test('an already cancelled reply never starts provider synthesis or fills the cache',async()=>{
  let requests=0,cacheReads=0;
  const controller=new AbortController();controller.abort();
  const clips=speech.requestSpeechClips({text:'word '.repeat(50).trim()},{provider:'groq',apiKey:'fixture',signal:controller.signal,clipCache:{getOrCreate(){cacheReads++;return Promise.resolve({value:fixtureWav([101])});}},fetchImpl:async()=>{requests++;return new Response(fixtureWav([101]),{headers:{'content-type':'audio/wav'}});}});
  await assert.rejects(clips.next(),{name:'AbortError'});
  assert.equal(requests,0);assert.equal(cacheReads,0);
});
