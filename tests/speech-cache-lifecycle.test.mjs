import test from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {createCache} from '../server/cache.mjs';
import {requestSpeech,requestSpeechClips} from '../server/speech.mjs';
import {fixtureWav} from './helpers/wav.mjs';

const deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const outcome=promise=>promise.then(value=>({value}),error=>({error}));
const audio=value=>new Response(fixtureWav([value]),{headers:{'content-type':'audio/wav'}});

test('shared pending audio keeps one consumer alive and aborts only after the last consumer leaves',async()=>{
  // Question: Does each departure release exactly one shared-work subscription?
  // Limits: In-process signals and listener cleanup; no provider/network evidence.
  const cache=createCache(),first=new AbortController(),second=new AbortController(),work=deferred();let upstream,firstResult;
  const factory=signal=>{upstream=signal;return work.promise;};
  const one=outcome(cache.getOrCreate('shared',factory,{signal:first.signal})).then(result=>{firstResult=result;return result;});
  const two=outcome(cache.getOrCreate('shared',factory,{signal:second.signal}));
  try{
    await tick();first.abort();await tick();
    assert.equal(firstResult?.error?.name,'AbortError','a departing consumer rejects promptly');
    assert.equal(upstream.aborted,false,'one remaining consumer keeps shared work alive');
    second.abort();await tick();
    assert.equal((await two).error.name,'AbortError');assert.equal(upstream.aborted,true);
    assert.equal(getEventListeners(first.signal,'abort').length,0);assert.equal(getEventListeners(second.signal,'abort').length,0);
  }finally{work.resolve(Buffer.from('audio'));await Promise.all([one,two]);}
});

for(const lateFirst of [true,false])test(`abandoned audio cannot replace or evict a fresh same-key job when it finishes ${lateFirst?'before':'after'} the replacement`,async()=>{
  // Question: Can stale completion in this order affect a replacement job/value?
  // Limits: Controlled promise ordering; no load, TTL-erasure, or cross-process claim.
  const cache=createCache(),controller=new AbortController(),jobs=[];
  const factory=signal=>{const job={...deferred(),signal};jobs.push(job);return job.promise;};
  const abandoned=outcome(cache.getOrCreate('same',factory,{signal:controller.signal}));
  let replacement,joined;
  try{
    await tick();controller.abort();
    replacement=cache.getOrCreate('same',factory);await tick();
    assert.equal(jobs.length,2,'a request after final cancellation must create fresh work');
    assert.equal(jobs[0].signal.aborted,true);assert.equal(jobs[1].signal.aborted,false);
    if(lateFirst){jobs[0].resolve(Buffer.from('stale'));await tick();joined=cache.getOrCreate('same',factory);await tick();assert.equal(jobs.length,2);}
    jobs[1].resolve(Buffer.from('fresh'));assert.equal((await replacement).value.toString(),'fresh');
    if(joined)assert.equal((await joined).value.toString(),'fresh');
    if(!lateFirst){jobs[0].resolve(Buffer.from('stale'));await tick();}
    assert.equal((await cache.getOrCreate('same',factory)).value.toString(),'fresh');assert.equal(jobs.length,2);
    assert.equal(jobs[1].signal.aborted,false,'normal settlement does not cancel completed work');
    assert.equal((await abandoned).error.name,'AbortError');
  }finally{for(const job of jobs)job.resolve(Buffer.from('cleanup'));await Promise.allSettled([abandoned,replacement,joined]);}
});

function synthesis(){
  const jobs=[];
  const options={provider:'groq',apiKey:'fixture',clipCache:createCache(),fetchImpl:(_url,{signal})=>{const job={...deferred(),signal};jobs.push(job);return job.promise;}};
  return {jobs,options,release(){for(const job of jobs)job.resolve(audio(1));}};
}

test('shared clip consumers cancel final synthesis and a later identical clip starts fresh',async()=>{
  // Question: Does clip-cache ownership reach the transport and reject stale fill?
  // Limits: Synthetic fetch intentionally ignores abort; no live provider guarantee.
  const {jobs,options,release}=synthesis(),first=new AbortController(),second=new AbortController(),input={text:'Shared audio.'};
  const one=requestSpeechClips(input,{...options,signal:first.signal}),two=requestSpeechClips(input,{...options,signal:second.signal});
  const firstResult=outcome(one.next()),secondResult=outcome(two.next());let fresh;
  try{
    await tick();assert.equal(jobs.length,1);
    first.abort();assert.equal((await firstResult).error.name,'AbortError');assert.equal(jobs[0].signal.aborted,false);
    second.abort();assert.equal((await secondResult).error.name,'AbortError');assert.equal(jobs[0].signal.aborted,true);
    fresh=requestSpeechClips(input,options);const next=fresh.next();await tick();assert.equal(jobs.length,2);
    jobs[0].resolve(audio(10));await tick();jobs[1].resolve(audio(20));assert.equal((await next).value.readInt16LE(44),20);
    assert.equal((await fresh.next()).done,true);
    assert.equal((await requestSpeech(input,options)).readInt16LE(44),20);assert.equal(jobs.length,2);
  }finally{release();await Promise.all([firstResult,secondResult]);if(fresh)await fresh.return();}
});

test('full narration consumers release their nested clips only when the last narration receiver leaves',async()=>{
  // Question: Does final full-audio cancellation release its nested clip work?
  // Limits: Real modules with explicit cache wiring; HTTP integration is separate.
  const {jobs,options,release}=synthesis(),fullCache=createCache(),first=new AbortController(),second=new AbortController(),input={text:'Shared narration.'};
  const narration=signal=>fullCache.getOrCreate('narration',workSignal=>requestSpeech(input,{...options,signal:workSignal}),{signal});
  const one=outcome(narration(first.signal)),two=outcome(narration(second.signal));let fresh;
  try{
    await tick();assert.equal(jobs.length,1);
    first.abort();await tick();assert.equal(jobs[0].signal.aborted,false);
    second.abort();await tick();assert.equal(jobs[0].signal.aborted,true,'the final narration departure releases upstream clip work');
    assert.equal((await one).error.name,'AbortError');assert.equal((await two).error.name,'AbortError');
    fresh=narration();await tick();assert.equal(jobs.length,2);
    jobs[1].resolve(audio(20));assert.equal((await fresh).value.readInt16LE(44),20);
    jobs[0].resolve(audio(10));await tick();
    assert.equal((await narration()).value.readInt16LE(44),20);assert.equal(jobs.length,2);
  }finally{release();await Promise.allSettled([one,two,fresh]);}
});

test('a departing full narration leaves a shared streamed clip available to its remaining listener',async()=>{
  // Question: Can a streamed receiver survive cancellation of the full-audio job?
  // Limits: One synthetic shared clip; no playback, device, or format-quality claim.
  const {jobs,options,release}=synthesis(),fullCache=createCache(),controller=new AbortController(),input={text:'A shared clip.'};
  const narration=outcome(fullCache.getOrCreate('narration',signal=>requestSpeech(input,{...options,signal}),{signal:controller.signal}));
  const stream=requestSpeechClips(input,options),clip=stream.next();
  try{
    await tick();assert.equal(jobs.length,1);controller.abort();await tick();
    assert.equal(jobs[0].signal.aborted,false);jobs[0].resolve(audio(31));
    assert.equal((await clip).value.readInt16LE(44),31);assert.equal((await stream.next()).done,true);
    assert.equal((await narration).error.name,'AbortError');assert.equal(jobs.length,1);
  }finally{release();await Promise.allSettled([narration,clip]);await stream.return();}
});

test('ending a partial clip iterator releases its remaining pending synthesis',async()=>{
  // Question: Does closing an iterator after one clip release eagerly pending work?
  // Limits: return() after a yield; not immediate return() during a pending next().
  const {jobs,options,release}=synthesis(),stream=requestSpeechClips({text:'word '.repeat(50).trim()},options),first=stream.next();
  try{
    await tick();assert.equal(jobs.length,2);jobs[0].resolve(audio(11));await first;
    await stream.return();assert.equal(jobs[1].signal.aborted,true);
  }finally{release();await first;await stream.return();}
});
