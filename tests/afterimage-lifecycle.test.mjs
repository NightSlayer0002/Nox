import test from 'node:test';
import assert from 'node:assert/strict';
import {createAfterimageBridge} from '../public/js/afterimage-bridge.js';
import {createVoice} from '../public/js/voice.js';
import {createRecorder} from '../public/js/recorder.js';
import {FIRST_CONTACT} from '../client/afterimage-example.js';

// Synthetic contract tests: each named test resolves only the lifecycle boundary
// in its name. They do not establish audible output, device timing, GPU behavior,
// encoded duration/quality, or real browser/encoder support.
function clock(){let time=0,serial=0;const jobs=new Map();return {now:()=>time,setTimer(fn,delay){const id=++serial;jobs.set(id,{at:time+delay,fn});return id;},clearTimer:id=>jobs.delete(id),advance(ms){const end=time+ms;for(;;){const next=[...jobs].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;time=next[1].at;jobs.delete(next[0]);next[1].fn();}time=end;},get pending(){return jobs.size;}};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({muted=false,blocked=false,startError=false}={}){
  const timer=clock(),players=[],requests=[],stops=[];let recording=false;
  const voice=createVoice({...timer,now:()=>timer.now()/1000,requestAudio:async()=>{requests.push(true);return new Blob(['audio']);},AudioContextCtor:null,
    AudioCtor:class{constructor(){this.currentTime=0;this.paused=true;players.push(this);}play(){this.paused=false;return blocked?Promise.reject(Error('Autoplay denied.')):Promise.resolve();}pause(){this.paused=true;}},
    urls:{createObjectURL:()=>`blob:${players.length}`,revokeObjectURL(){}},
  });voice.configureNatural(true);voice.setEngine('natural');voice.setEnabled(!muted);
  const bridge=createAfterimageBridge(timer);bridge.connect({
    prepare:(text,emotion,cues)=>voice.enabled?voice.prepare(text,'companion',emotion,cues).then(Boolean):undefined,
    speak:(text,emotion,cues,options)=>voice.speak(text,'companion',emotion,cues,options),isSpeaking:()=>voice.state==='speaking',cue(){},stop:()=>voice.stop(),
    startRecording(){if(startError)throw Error('Encoder allocation failed.');recording=true;},stopRecording(){recording=false;stops.push(timer.now());},
    getState:()=>({recording,recordSupported:true,voiceEnabled:voice.enabled}),
  });return {timer,voice,bridge,players,requests,stops,nativeStop(){recording=false;bridge.recordingEnded();}};
}

for(const options of [{blocked:true},{muted:true}])test(`real voice fallback persists captions-only state: ${JSON.stringify(options)}`,async()=>{
  const f=fixture(options);f.bridge.play(FIRST_CONTACT);await settle();
  assert.equal(f.bridge.snapshot().preparing,false);assert.equal(f.bridge.snapshot().captionsOnly,true);assert.match(f.bridge.snapshot().voiceError,/caption/i);
  assert.equal(f.requests.length,options.blocked?1:0);
  if(options.blocked)assert.match(f.bridge.snapshot().voiceError,/Autoplay denied/);f.bridge.dispose();
});

test('actual playback starts the cue timeline and a later decode failure persists captions-only state',async()=>{
  const f=fixture();f.bridge.play(FIRST_CONTACT);await settle();
  assert.equal(f.bridge.snapshot().preparing,true);f.timer.advance(1000);f.players[0].onplaying();
  assert.equal(f.bridge.snapshot().preparing,false);assert.equal(f.bridge.snapshot().captionsOnly,false);
  f.players[0].onerror();assert.equal(f.bridge.snapshot().captionsOnly,true);assert.match(f.bridge.snapshot().voiceError,/caption/i);f.bridge.dispose();
});

test('delayed capture startup failure retains the actionable encoder error',async()=>{
  const f=fixture({startError:true});f.bridge.recordAndPlay(FIRST_CONTACT);await settle();
  assert.equal(f.bridge.snapshot().status,'stopped');assert.match(f.bridge.snapshot().captureError,/Encoder allocation failed/);assert.equal(f.bridge.snapshot().recording,false);f.bridge.dispose();
});

for(const startupMs of [0,10000,24000])test(`capture and narration share one wall-clock limit after ${startupMs}ms playback startup`,async()=>{
  const timer=clock();let recording=false,speaking=false,start;const stops=[];
  const bridge=createAfterimageBridge(timer);bridge.connect({
    cue(){},speak(_text,_emotion,_cues,options){return new Promise(resolve=>{start=()=>{speaking=true;options?.onPlaybackStart();resolve({status:'starting'});};});},isSpeaking:()=>speaking,
    startRecording(){recording=true;},stopRecording(){recording=false;stops.push(timer.now());},stop(){speaking=false;},getState:()=>({recording,recordSupported:true,voiceEnabled:true}),
  });bridge.recordAndPlay(FIRST_CONTACT);timer.advance(startupMs);start();await settle();timer.advance(60000-startupMs);
  assert.equal(bridge.snapshot().status,'complete');assert.equal(speaking,false);assert.equal(recording,false);assert.deepEqual(stops,[60000]);assert.equal(timer.pending,0);bridge.dispose();
});

test('a native early recording stop also stops only its owned performance',async()=>{
  const f=fixture();f.bridge.recordAndPlay(FIRST_CONTACT);await settle();f.nativeStop();
  assert.equal(f.bridge.snapshot().status,'stopped');assert.equal(f.bridge.snapshot().reason,'recording-ended');assert.equal(f.bridge.snapshot().recording,false);assert.equal(f.timer.pending,0);f.bridge.dispose();
});

test('unsupported encoder preflight prevents costly voice preparation',()=>{
  const bridge=createAfterimageBridge();let prepared=0;
  bridge.connect({getState:()=>({recordSupported:true}),startRecording(){},validateRecording(){throw Error('WebM export is unavailable here.');},prepare(){prepared++;}});
  assert.throws(()=>bridge.recordAndPlay(FIRST_CONTACT),/WebM/);assert.equal(prepared,0);bridge.dispose();
});

test('real recorder preflight rejects unsupported WebM without allocating tracks',t=>{
  const previous=globalThis.MediaRecorder;let captures=0;
  globalThis.MediaRecorder=class{static isTypeSupported(){return false;}};
  t.after(()=>{if(previous===undefined)delete globalThis.MediaRecorder;else globalThis.MediaRecorder=previous;});
  const recorder=createRecorder({captureStream(){captures++;throw Error('No stream should be opened.');}},()=>{});
  assert.throws(()=>recorder.preflight('landscape'),/WebM/);assert.equal(captures,0);assert.equal(recorder.active,false);
});

test('real recorder finalization lag cannot leave narration running behind a finished capture deadline',t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  const previous=globalThis.MediaRecorder,encoders=[],clips=[],tracks=[];let speaking=false,start;
  globalThis.MediaRecorder=class{
    static isTypeSupported(){return true;}
    constructor(){this.state='inactive';encoders.push(this);}
    start(){this.state='recording';}
    stop(){this.state='inactive';setTimeout(()=>{this.ondataavailable({data:new Blob(['encoded'])});this.onstop();},2500);}
  };
  t.after(()=>{if(previous===undefined)delete globalThis.MediaRecorder;else globalThis.MediaRecorder=previous;for(const clip of clips)URL.revokeObjectURL(clip.url);});
  const bridge=createAfterimageBridge({now:()=>Date.now()});
  const recorder=createRecorder({width:1280,height:720,captureStream(){const track={stop(){this.stopped=true;}};tracks.push(track);return {getTracks:()=>[track]};}},(active,clip)=>{if(!active)bridge.recordingEnded();if(clip)clips.push(clip);});
  bridge.connect({
    cue(){},speak(_text,_emotion,_cues,options){return new Promise(resolve=>{start=()=>{speaking=true;options.onPlaybackStart();resolve({status:'starting'});};});},isSpeaking:()=>speaking,stop(){speaking=false;},
    startRecording:()=>recorder.start(),stopRecording:()=>recorder.stop(),getState:()=>({recording:recorder.active,recordSupported:recorder.supported}),
  });bridge.recordAndPlay(FIRST_CONTACT);t.mock.timers.tick(10000);start();t.mock.timers.tick(50000);
  assert.equal(speaking,false);assert.equal(bridge.snapshot().status,'complete');assert.equal(clips.length,0);assert.equal(encoders[0].state,'inactive');
  t.mock.timers.tick(2500);assert.equal(clips.length,1);assert.ok(tracks.every(track=>track.stopped));assert.equal(bridge.snapshot().status,'complete');bridge.dispose();
});
