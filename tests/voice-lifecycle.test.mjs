import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoice} from '../public/js/voice.js';

function naturalVoice(options={}){
  const requests=[],players=[];
  const voice=createVoice({
    requestAudio:(_text,_mode,signal)=>new Promise((resolve,reject)=>requests.push({resolve,reject,signal})),
    AudioCtor:class{
      constructor(){this.paused=true;this.currentTime=0;players.push(this);}
      play(){this.paused=false;return Promise.resolve();}
      pause(){this.paused=true;}
    },
    AudioContextCtor:null,
    urls:{createObjectURL:()=>`blob:${players.length}`,revokeObjectURL(){}},
    ...options,
  });
  voice.configureNatural(true);voice.setEngine('natural');voice.setEnabled(true);
  return {voice,requests,players};
}

test('a reply playback hook waits for audible playback and reports measured startup stages once',async()=>{
  let time=1;const starts=[],unavailable=[],timings=[];
  const {voice,requests,players}=naturalVoice({now:()=>time,onTiming:timing=>timings.push(timing)});
  const prepared=voice.prepare('A measured reply.','companion','curious');
  time=1.1;
  const speech=voice.speak('A measured reply.','companion','curious',undefined,{onPlaybackStart:timing=>starts.push(timing),onPlaybackUnavailable:reason=>unavailable.push(reason)});
  time=1.3;requests[0].resolve(new Blob(['audio']));await prepared;await speech;
  assert.equal(starts.length,0);
  assert.equal(voice.latency.status,'starting');
  time=1.45;players[0].onplaying();players[0].onplaying();
  assert.equal(starts.length,1);
  assert.equal(starts[0].preparationMs,300);
  assert.equal(starts[0].audioReadyMs,200);
  assert.equal(starts[0].playbackWaitMs,150);
  assert.equal(starts[0].totalMs,350);
  assert.equal(starts[0].engine,'natural');
  assert.equal(starts[0].status,'speaking');
  assert.equal(Object.isFrozen(starts[0]),true);
  assert.deepEqual(unavailable,[]);
  assert.deepEqual(timings.map(timing=>timing.status),['preparing','starting','speaking']);
  time=2;players[0].onended();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(voice.latency.status,'ended');
  assert.equal(voice.latency.playbackMs,550);
  voice.stop();
});

test('MP3 preparation skips the redundant WAV waveform byte read',async()=>{
  const {voice,requests}=naturalVoice();
  const audio=new Blob(['mp3'],{type:'audio/mpeg'});
  audio.arrayBuffer=()=>{throw Error('MP3 must not be read for a WAV-only envelope.');};
  const ready=voice.prepare('MP3 has no WAV envelope.');requests[0].resolve(audio);
  assert.ok(await ready);
  assert.equal(voice.state,'ready');
  voice.stop();
});

test('a failed or blocked voice releases the reply through its own unavailable hook once',async()=>{
  for(const failure of ['provider','playback']){
    const unavailable=[],starts=[];
    const {voice,requests,players}=naturalVoice(failure==='playback'?{AudioCtor:class{constructor(){players.push(this);}play(){return Promise.reject(Error('autoplay blocked'));}pause(){}}}:{});
    const speech=voice.speak('Keep this reply readable.','companion','neutral',undefined,{onPlaybackStart:()=>starts.push(true),onPlaybackUnavailable:value=>unavailable.push(value)});
    if(failure==='provider')requests[0].reject(Error('quota'));else requests[0].resolve(new Blob(['audio']));
    await speech;
    assert.equal(starts.length,0);
    assert.equal(unavailable.length,1);
    assert.equal(unavailable[0].status,'unavailable');
    assert.equal(voice.latency.status,'unavailable');
    assert.equal(voice.state,'idle');
    voice.stop();assert.equal(unavailable.length,1);
  }
});

test('muted and unsupported voice make the reply readable without requesting audio',async()=>{
  const {voice,requests}=naturalVoice(),unavailable=[];
  voice.setEnabled(false);
  await voice.speak('A readable muted reply.','companion','neutral',undefined,{onPlaybackUnavailable:value=>unavailable.push(value)});
  assert.equal(unavailable.length,1);assert.equal(unavailable[0].reason,'disabled');assert.equal(requests.length,0);
  const unsupported=createVoice({AudioCtor:null}),fallback=[];
  await unsupported.speak('A readable unsupported reply.','companion','neutral',undefined,{onPlaybackUnavailable:value=>fallback.push(value)});
  assert.equal(fallback.length,1);assert.equal(fallback[0].reason,'unsupported');
});

test('cancellation prevents old per-reply hooks and latency from affecting the next narration',async()=>{
  const firstEvents=[],nextEvents=[];
  const {voice,requests,players}=naturalVoice();
  const first=voice.speak('Old reply.','companion','neutral',undefined,{onPlaybackStart:()=>firstEvents.push('start'),onPlaybackUnavailable:()=>firstEvents.push('fallback')});
  requests[0].resolve(new Blob(['old']));await first;
  const oldPlaying=players[0].onplaying,oldError=players[0].onerror;
  voice.stop();
  const second=voice.speak('Current reply.','companion','neutral',undefined,{onPlaybackStart:()=>nextEvents.push('start'),onPlaybackUnavailable:()=>nextEvents.push('fallback')});
  requests[1].resolve(new Blob(['current']));await second;players[1].onplaying();
  const currentTiming=voice.latency;oldPlaying();oldError();
  assert.deepEqual(firstEvents,[]);assert.deepEqual(nextEvents,['start']);assert.equal(voice.latency,currentTiming);
  voice.stop();
});

test('browser narration reveals once at utterance start and reports startup errors without switching voice',async()=>{
  const oldSynth=globalThis.speechSynthesis,oldUtterance=globalThis.SpeechSynthesisUtterance,spoken=[];
  globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  globalThis.speechSynthesis={cancel(){},getVoices:()=>[],speak:utterance=>spoken.push(utterance)};
  try{
    let time=1;const starts=[],unavailable=[];
    const voice=createVoice({now:()=>time});voice.setEnabled(true);
    await voice.speak('Browser speech.','companion','neutral',undefined,{onPlaybackStart:value=>starts.push(value),onPlaybackUnavailable:value=>unavailable.push(value)});
    assert.equal(starts.length,0);time=1.2;spoken[0].onstart();spoken[0].onstart();
    assert.equal(starts.length,1);assert.equal(starts[0].playbackWaitMs,200);assert.equal(starts[0].preparationMs,0);
    spoken[0].onerror({error:'synthesis-failed'});assert.equal(unavailable.length,0);
    await voice.speak('A failed browser reply.','companion','neutral',undefined,{onPlaybackUnavailable:value=>unavailable.push(value)});
    spoken[1].onerror({error:'synthesis-failed'});assert.equal(unavailable.length,1);assert.equal(unavailable[0].reason,'playback-error');
    voice.stop();
  }finally{
    if(oldSynth===undefined)delete globalThis.speechSynthesis;else globalThis.speechSynthesis=oldSynth;
    if(oldUtterance===undefined)delete globalThis.SpeechSynthesisUtterance;else globalThis.SpeechSynthesisUtterance=oldUtterance;
  }
});
