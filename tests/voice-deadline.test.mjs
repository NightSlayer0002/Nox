import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoice} from '../public/js/voice.js';
function clock(){let job;return {setTimer(fn){job=fn;return 1;},clearTimer(){job=null;},expire(){const fn=job;job=null;fn?.();},get pending(){return Boolean(job);}};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(requestAudio,options={}){const timer=clock(),errors=[],signals=[],players=[];const voice=createVoice({requestAudio:(text,mode,signal)=>{signals.push(signal);return requestAudio();},AudioCtor:class{constructor(){players.push(this);}play(){return Promise.resolve();}pause(){}},urls:{createObjectURL:()=>'',revokeObjectURL(){}},onError:error=>errors.push(error),...timer,...options});voice.configureNatural(true);voice.setEngine('natural');voice.setEnabled(true);return {voice,timer,errors,signals,players};}
for(const phase of ['headers','body','reader'])test(`natural speech abandons stalled ${phase} within the whole preparation deadline`,{timeout:1000},async()=>{const stalled=()=>new Promise(()=>{}),blob=new Blob(['wav']);blob.arrayBuffer=stalled;const f=fixture(phase==='body'?async()=>blob:stalled,phase==='reader'?{requestClips:()=>({[Symbol.asyncIterator](){return this;},next:stalled})}:{});const prepared=f.voice.prepare('No permanent spinner.');const spoken=f.voice.speak('No permanent spinner.');await settle();assert.equal(f.voice.state,'preparing');f.timer.expire();await prepared;await spoken;assert.equal(f.voice.state,'idle');assert.equal(f.players.length,0);assert.match(f.errors[0],/timed out/i);if(phase!=='reader')assert.equal(f.signals[0].aborted,true);assert.equal(f.timer.pending,false);f.voice.stop();});
test('Stop clears a stalled preparation deadline and no late error is announced',{timeout:1000},async()=>{const f=fixture(()=>new Promise(()=>{}));const prepared=f.voice.prepare('Cancelled.');f.voice.stop();await prepared;f.timer.expire();await settle();assert.equal(f.timer.pending,false);assert.deepEqual(f.errors,[]);assert.equal(f.signals[0].aborted,true);});


test('rejecting an invalid clip cancels its producer and closes the async iterator',async()=>{
  let returned=false,signal;
  async function* clips(){try{yield {blob:new Blob([])};await new Promise(()=>{});}finally{returned=true;}}
  const f=fixture(()=>null,{requestClips:(_text,_mode,current)=>{signal=current;return clips();}});
  const spoken=f.voice.speak('Invalid clip.');await spoken;await settle();assert.equal(signal.aborted,true);assert.equal(returned,true);assert.equal(f.voice.state,'idle');f.voice.stop();
});
