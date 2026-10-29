import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecorder} from '../public/js/recorder.js';
import {createAfterimageBridge} from '../public/js/afterimage-bridge.js';
import {FIRST_CONTACT} from '../client/afterimage-example.js';

function fixture(t){
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  const previous=globalThis.MediaRecorder,encoders=[],tracks=[],clips=[],outcomes=[],stops=[];
  globalThis.MediaRecorder=class{
    static isTypeSupported(){return true;}
    constructor(){this.state='inactive';encoders.push(this);}
    start(){this.state='recording';}stop(){this.state='inactive';}
    finish(text=''){if(text)this.ondataavailable({data:new Blob([text])});this.onstop();}
  };
  const bridge=createAfterimageBridge({now:()=>Date.now()});
  const recorder=createRecorder({width:1280,height:720,captureStream(){const track={stopped:false,stop(){this.stopped=true;}};tracks.push(track);return {getTracks:()=>[track]};}},(active,clip,outcome)=>{if(!active){outcomes.push(outcome);bridge.recordingEnded(outcome);}if(clip)clips.push(clip);});
  bridge.connect({cue(){},speak(){},stop:reason=>stops.push(reason),startRecording:()=>recorder.start(),stopRecording:reason=>recorder.stop(reason),getState:()=>({recording:recorder.active,recordSupported:true,voiceEnabled:false})});
  t.after(()=>{bridge.dispose();for(const clip of clips)URL.revokeObjectURL(clip.url);if(previous===undefined)delete globalThis.MediaRecorder;else globalThis.MediaRecorder=previous;});
  return {bridge,recorder,encoders,tracks,clips,outcomes,stops};
}

for(const boundary of ['playing','finalizing'])test(`a late encoder error remains actionable while ${boundary}`,t=>{
  // Question: Does an owned encoder failure reach persistent receiver state even after the cue timeline has finished?
  // Limits: Real recorder/bridge/controller, synthetic MediaRecorder/timers; no real WebM decode, duration, GPU or device support claim.
  const f=fixture(t);f.bridge.recordAndPlay(FIRST_CONTACT);if(boundary==='finalizing')t.mock.timers.tick(28000);
  f.encoders[0].onerror();f.encoders[0].onstop();
  assert.equal(f.outcomes.length,1);assert.equal(f.outcomes[0]?.status,'encoder-failed');assert.equal(f.clips.length,0);assert.ok(f.tracks.every(track=>track.stopped));
  assert.match(f.bridge.snapshot().captureError,/record|captur/i);assert.equal(f.bridge.snapshot().captureOutcome,'encoder-failed');
  t.mock.timers.tick(10000);assert.match(f.bridge.snapshot().captureError,/try|again|format/i);
});

test('empty capture is distinct from a saved clip and remains recoverable',t=>{
  // Question: Can empty output be mistaken for successful capture by the receiver after safe track cleanup?
  // Limits: Empty synthetic encoder body, not real encoder failure frequency or disk download success.
  const f=fixture(t);f.bridge.recordAndPlay(FIRST_CONTACT);f.recorder.stop();f.encoders[0].finish();
  assert.equal(f.outcomes[0]?.status,'empty');assert.equal(f.bridge.snapshot().captureOutcome,'empty');assert.match(f.bridge.snapshot().captureError,/again|format/i);assert.equal(f.clips.length,0);
});

test('a manually stopped valid capture reports a saved outcome and its stop reason',t=>{
  // Question: Does intentional Stop still produce a usable clip outcome rather than a false failure?
  // Limits: Nonempty synthetic bytes and outcome metadata; not a validated real recording or filesystem save.
  const f=fixture(t);f.bridge.recordAndPlay(FIRST_CONTACT);f.bridge.stop('user');f.encoders[0].finish('encoded');
  assert.equal(f.outcomes[0]?.status,'saved');assert.equal(f.outcomes[0]?.reason,'user');assert.equal(f.bridge.snapshot().captureError,'');assert.equal(f.clips.length,1);
});

test('old capture finalization cannot stop a newer performance',t=>{
  // Question: Does late encoder completion retain the identity of its original performance rather than stopping whatever is now playing?
  // Limits: One controlled timer/event ordering; not every browser's MediaRecorder sequencing.
  const f=fixture(t);f.bridge.recordAndPlay(FIRST_CONTACT);t.mock.timers.tick(28000);f.bridge.play(FIRST_CONTACT,1);
  const version=f.bridge.snapshot().version;f.encoders[0].onerror();
  assert.equal(f.bridge.snapshot().status,'playing');assert.equal(f.bridge.snapshot().version,version);assert.match(f.bridge.snapshot().captureError,/again|format/i);
});

test('a new capture attempt clears an older capture failure',t=>{
  // Question: Is a previous failure retained long enough to recover without contaminating the next owned capture?
  // Limits: Receiver state reset and resource ownership only; no actual codec recovery claim.
  const f=fixture(t);f.bridge.recordAndPlay(FIRST_CONTACT);f.encoders[0].onerror();assert.match(f.bridge.snapshot().captureError,/again|format/i);
  f.bridge.recordAndPlay(FIRST_CONTACT);assert.equal(f.bridge.snapshot().captureError,'');assert.equal(f.bridge.snapshot().captureOutcome,'');
});
