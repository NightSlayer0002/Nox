import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoice, selectBrowserVoice } from '../public/js/voice.js';

test('natural browser voices outrank legacy voices without distorting normal pitch', () => {
  const legacy = {name:'Microsoft David',lang:'en-US',localService:true};
  const natural = {name:'Microsoft Guy Online (Natural)',lang:'en-US',localService:false};
  assert.equal(selectBrowserVoice([legacy,natural]),natural);
  assert.equal(selectBrowserVoice([{name:'Other',lang:'fr-FR'},legacy]),legacy);
  assert.equal(selectBrowserVoice([]),undefined);
});

test('automatic character voice prefers a male voice over a female natural default',()=>{
  const female={name:'Microsoft Jenny Online (Natural)',lang:'en-US',localService:false},male={name:'Microsoft David',lang:'en-US',localService:true};
  assert.equal(selectBrowserVoice([female,male]),male);
});

test('sentence endings and stale boundaries cannot leave the mouth open',async()=>{
  const oldSynth=globalThis.speechSynthesis,oldUtterance=globalThis.SpeechSynthesisUtterance,spoken=[];
  globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  globalThis.speechSynthesis={cancel(){},getVoices:()=>[],speak:u=>spoken.push(u)};
  try{
    const voice=createVoice();voice.setEnabled(true);await voice.speak('Hello. Next thought.');spoken[0].onstart();spoken[0].onboundary({name:'word',charIndex:0});assert.ok(voice.mouthLevel>0);
    spoken[0].onend();assert.equal(voice.mouthLevel,0);voice.stop();spoken[0].onboundary({name:'word',charIndex:0});assert.equal(voice.mouthLevel,0);
    assert.equal(spoken[0].text,'Hello.');
  }finally{if(oldSynth===undefined)delete globalThis.speechSynthesis;else globalThis.speechSynthesis=oldSynth;if(oldUtterance===undefined)delete globalThis.SpeechSynthesisUtterance;else globalThis.SpeechSynthesisUtterance=oldUtterance;}
});

test('obsolete speech events cannot end or start a newer performance', () => {
  const previousSynth = globalThis.speechSynthesis, previousUtterance = globalThis.SpeechSynthesisUtterance;
  const spoken = [];
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  globalThis.speechSynthesis = { cancel() {}, getVoices: () => [], speak: value => spoken.push(value) };
  let starts = 0, ends = 0;
  try {
    const voice = createVoice({ onStart: () => starts++, onEnd: () => ends++ });
    voice.setEnabled(true); voice.speak('First'); spoken[0].onstart();
    voice.stop(); voice.speak('Second'); spoken[1].onstart();
    const before = { starts, ends };
    spoken[0].onerror({ error: 'interrupted' }); spoken[0].onend(); spoken[0].onstart();
    assert.deepEqual({ starts, ends }, before);
    spoken[1].onend();
    assert.equal(ends, before.ends + 1);
  } finally {
    if (previousSynth === undefined) delete globalThis.speechSynthesis; else globalThis.speechSynthesis = previousSynth;
    if (previousUtterance === undefined) delete globalThis.SpeechSynthesisUtterance; else globalThis.SpeechSynthesisUtterance = previousUtterance;
  }
});

test('natural voice aborts pending audio and never plays an obsolete reply', async () => {
  const pending=[], played=[], revoked=[];
  const voice=createVoice({requestAudio:(text,mode,signal)=>new Promise(resolve=>pending.push({resolve,signal})),AudioCtor:class {constructor(url){this.url=url;} play(){played.push(this);this.onplaying?.();return Promise.resolve();} pause(){this.paused=true;}},urls:{createObjectURL:()=>`blob:${played.length}`,revokeObjectURL:url=>revoked.push(url)}});
  voice.configureNatural(true); voice.setEngine('natural'); voice.setEnabled(true);
  const first=voice.speak('First'); voice.stop(); const second=voice.speak('Second');
  assert.equal(pending[0].signal.aborted,true);
  pending[0].resolve(new Blob(['old'])); await first; assert.equal(played.length,0);
  pending[1].resolve(new Blob(['new'])); await second; assert.equal(played.length,1);
  voice.stop(); assert.equal(played[0].paused,true); assert.equal(revoked.length,1);
});
test('natural voice playback errors release the blob and leave captions usable', async () => {
  let errors=0, revokes=0;
  const voice=createVoice({requestAudio:async()=>new Blob(['audio']),onError:()=>errors++,AudioCtor:class {play(){return Promise.reject(Error('autoplay'));} pause(){}},urls:{createObjectURL:()=> 'blob:audio',revokeObjectURL:()=>revokes++}});
  voice.configureNatural(true);voice.setEngine('natural');voice.setEnabled(true);await voice.speak('Hi');
  assert.equal(errors,1);assert.equal(revokes,1);
});
