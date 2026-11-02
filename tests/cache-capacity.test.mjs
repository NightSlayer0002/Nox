import test from 'node:test';
import assert from 'node:assert/strict';
import {createCache} from '../server/cache.mjs';
import {requestSpeech} from '../server/speech.mjs';
import {fixtureWav} from './helpers/wav.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const outcome=promise=>promise.then(value=>({value}),error=>({error}));
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('a full audio cache rejects a distinct key before starting its factory',async()=>{
  // Question: Can unique pending work exceed the cache limit before factories begin?
  // Limits: In-process admission only; no HTTP, provider billing, or global budget claim.
  const cache=createCache({maxEntries:1}),work=deferred();let overflowCalls=0;
  const first=cache.getOrCreate('active',()=>work.promise);
  try{
    await assert.rejects(cache.getOrCreate('PRIVATE overflow key',()=>{overflowCalls++;return Buffer.from('PRIVATE audio');}),error=>{
      assert.equal(error.code,'busy');
      assert.doesNotMatch(`${error.stack}\n${JSON.stringify(error)}`,/PRIVATE/);
      return true;
    });
    assert.equal(overflowCalls,0,'rejected work must not reach its upstream factory');
  }finally{work.resolve(Buffer.from('first'));await first;}
});

test('cached hits and same-key subscribers remain available at pending capacity',async()=>{
  // Question: Does capacity reject new work while still reusing completed and active audio?
  // Limits: One cache instance and controlled jobs; no cross-process deduplication claim.
  const cache=createCache({maxEntries:1}),work=deferred();
  await cache.getOrCreate('cached',()=>Buffer.from('cached audio'));
  const first=cache.getOrCreate('active',()=>work.promise);
  const duplicate=cache.getOrCreate('active',()=>{throw Error('Duplicate work must coalesce.');});
  try{
    const cached=await cache.getOrCreate('cached',()=>{throw Error('Cached audio must be reused.');});
    assert.equal(cached.hit,true);assert.equal(cached.value.toString(),'cached audio');
    work.resolve(Buffer.from('shared audio'));
    const results=await Promise.all([first,duplicate]);
    assert.deepEqual(results.map(result=>result.hit),[false,true]);
    assert.deepEqual(results.map(result=>result.value.toString()),['shared audio','shared audio']);
    assert.equal((await cache.getOrCreate('next',()=>Buffer.from('next audio'))).value.toString(),'next audio');
  }finally{work.resolve(Buffer.from('cleanup'));await Promise.allSettled([first,duplicate]);}
});

test('failed audio work releases its pending capacity for a new key',async()=>{
  // Question: Can a provider failure leave a cache slot permanently occupied?
  // Limits: Controlled factory failure; no transport timeout or retry policy claim.
  const cache=createCache({maxEntries:1}),work=deferred(),failure=Error('Expected factory failure.');
  const first=outcome(cache.getOrCreate('failed',()=>work.promise));
  try{
    await assert.rejects(cache.getOrCreate('blocked',()=>Buffer.from('blocked')),{code:'busy'});
    work.reject(failure);assert.equal((await first).error,failure);
    const result=await cache.getOrCreate('replacement',()=>Buffer.from('replacement'));
    assert.equal(result.hit,false);assert.equal(result.value.toString(),'replacement');
  }finally{work.resolve(Buffer.from('cleanup'));await first;}
});

test('only the last canceled subscriber releases pending capacity and aborts upstream work',async()=>{
  // Question: Can one departing subscriber admit extra work or strand capacity after everyone leaves?
  // Limits: Synthetic work ignores abort until explicitly settled; no upstream billing guarantee.
  const cache=createCache({maxEntries:1}),work=deferred(),first=new AbortController(),second=new AbortController();let upstream;
  const one=outcome(cache.getOrCreate('shared',signal=>{upstream=signal;return work.promise;},{signal:first.signal}));
  const two=outcome(cache.getOrCreate('shared',()=>{throw Error('Duplicate work must coalesce.');},{signal:second.signal}));
  try{
    await tick();first.abort();assert.equal((await one).error.name,'AbortError');
    assert.equal(upstream.aborted,false);
    await assert.rejects(cache.getOrCreate('blocked',()=>Buffer.from('blocked')),{code:'busy'});
    second.abort();assert.equal((await two).error.name,'AbortError');assert.equal(upstream.aborted,true);
    assert.equal((await cache.getOrCreate('replacement',()=>Buffer.from('fresh'))).value.toString(),'fresh');
    work.resolve(Buffer.from('stale'));await tick();
    const cached=await cache.getOrCreate('replacement',()=>{throw Error('Canceled work must not evict fresh audio.');});
    assert.equal(cached.hit,true);assert.equal(cached.value.toString(),'fresh');
  }finally{work.resolve(Buffer.from('cleanup'));await Promise.all([one,two]);}
});

test('clip-cache capacity rejects new narration before reaching the speech transport',async()=>{
  // Question: Does bounded cache admission suppress real synthesis calls for excess narration?
  // Limits: Real speech/cache modules with synthetic fetch; no HTTP route or live provider claim.
  const work=deferred(),clipCache=createCache({maxEntries:1});let calls=0;
  const audio=()=>new Response(fixtureWav([7]),{headers:{'content-type':'audio/wav'}});
  const options={provider:'groq',apiKey:'fixture',clipCache,fetchImpl:async()=>{calls++;return calls===1?work.promise:audio();}};
  const first=requestSpeech({text:'First narration.'},options);
  try{
    await tick();assert.equal(calls,1);
    await assert.rejects(requestSpeech({text:'Other narration.'},options),{code:'busy'});
    assert.equal(calls,1,'a capacity rejection must not reach the speech transport');
    work.resolve(audio());assert.equal((await first).readInt16LE(44),7);
  }finally{work.resolve(audio());await first;}
});
