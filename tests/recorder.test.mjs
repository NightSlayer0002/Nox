import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecorder} from '../public/js/recorder.js';

function setup(t,{width=1280,height=720,startError=false,captureError=false,stopError=false}={}) {
  t.mock.timers.enable({apis:['setTimeout']});
  const instances=[],states=[],tracks=[],captures=[];
  const track=kind=>({kind,stopped:false,stop(){this.stopped=true;},clone(){return track(kind);}});
  const voice=track('audio');
  class Encoder {
    static isTypeSupported(type){return type.includes('opus');}
    constructor(stream,options){this.stream=stream;this.options=options;this.state='inactive';instances.push(this);}
    start(){if(startError)throw Error('encoder failed');this.state='recording';}
    stop(){if(stopError)throw Error('stop failed');this.state='inactive';this.ondataavailable({data:new Blob(['encoded'])});this.onstop();}
  }
  const previous=globalThis.MediaRecorder;globalThis.MediaRecorder=Encoder;
  t.after(()=>{if(previous===undefined)delete globalThis.MediaRecorder;else globalThis.MediaRecorder=previous;});
  const canvas={width,height,captureStream(frameRate){
    if(captureError)throw Error('capture failed');
    captures.push({width:this.width,height:this.height,frameRate});tracks.push(track('video'));
    return {getTracks:()=>tracks,addTrack:audio=>tracks.push(audio)};
  }};
  const recorder=createRecorder(canvas,(active,clip)=>states.push({active,clip}),{getAudioStream:()=>({getAudioTracks:()=>[voice]})});
  t.after(()=>{for(const state of states)if(state.clip)URL.revokeObjectURL(state.clip.url);});
  return {recorder,canvas,instances,states,tracks,captures,voice};
}

test('a default landscape clip reports fixed dimensions and captures natural voice',t=>{
  const f=setup(t);f.recorder.start();f.recorder.stop();
  assert.deepEqual(f.captures,[{width:1280,height:720,frameRate:30}]);
  const clip=f.states.at(-1).clip;
  assert.deepEqual([clip.profile,clip.width,clip.height,clip.aspectRatio,clip.frameRate],['landscape',1280,720,'16:9',30]);
  assert.equal(clip.audio,true);assert.equal(f.voice.stopped,false);
  assert.equal(f.tracks.length,2);assert.ok(f.tracks.every(track=>track.stopped));
  assert.ok(f.instances[0].options.videoBitsPerSecond<=6000000);
});

for(const [profile,width,height,aspectRatio] of [['portrait',720,1280,'9:16'],['square',1080,1080,'1:1']]) {
  test(`${profile} clips retain their chosen dimensions in saved metadata`,t=>{
    const f=setup(t,{width,height});f.recorder.start(profile);f.recorder.stop();
    const clip=f.states.at(-1).clip;
    assert.deepEqual([clip.profile,clip.width,clip.height,clip.aspectRatio],[profile,width,height,aspectRatio]);
  });
}

test('a preview-sized canvas is rejected before a low resolution stream can start',t=>{
  const f=setup(t,{width:370,height:360});
  assert.throws(()=>f.recorder.start('landscape'),/dimensions|resolution/i);
  assert.equal(f.captures.length,0);assert.equal(f.recorder.active,false);
  assert.deepEqual(f.states.at(-1),{active:false,clip:null});
});

for(const [scenario,options,message] of [['capture failure',{captureError:true},/capture failed/],['encoder failure',{startError:true},/encoder failed/]]) {
  test(`${scenario} releases session ownership and notifies the stage to unlock`,t=>{
    const f=setup(t,options);assert.throws(()=>f.recorder.start(),message);
    assert.equal(f.recorder.active,false);assert.ok(f.tracks.every(track=>track.stopped));
    assert.equal(f.voice.stopped,false);assert.deepEqual(f.states.at(-1),{active:false,clip:null});
  });
}

test('a stop failure releases recording tracks and the preview lock',t=>{
  const f=setup(t,{stopError:true});f.recorder.start();
  assert.throws(()=>f.recorder.stop(),/stop failed/);
  assert.equal(f.recorder.active,false);assert.ok(f.tracks.every(track=>track.stopped));
  assert.deepEqual(f.states.at(-1),{active:false,clip:null});
});

test('an encoder error discards its partial clip and unlocks only once',t=>{
  const f=setup(t);f.recorder.start('landscape');
  f.instances[0].ondataavailable({data:new Blob(['partial'])});
  f.instances[0].onerror();f.instances[0].onstop();
  assert.equal(f.recorder.active,false);assert.ok(f.tracks.every(track=>track.stopped));
  assert.deepEqual(f.states,[{active:true,clip:false},{active:false,clip:null}]);
});

for(const profile of ['4k',{id:'landscape',width:3840,height:2160},{id:'landscape',frameRate:120}]) {
  test(`an unsupported profile cannot start an oversized or high frame rate capture: ${JSON.stringify(profile)}`,t=>{
    const f=setup(t);assert.throws(()=>f.recorder.start(profile),/profile/i);
    assert.equal(f.captures.length,0);assert.equal(f.recorder.active,false);
    assert.deepEqual(f.states.at(-1),{active:false,clip:null});
  });
}

test('an export still stops automatically after sixty seconds',t=>{
  const f=setup(t);f.recorder.start();t.mock.timers.tick(59999);
  assert.equal(f.recorder.active,true);
  t.mock.timers.tick(1);
  assert.equal(f.recorder.active,false);assert.ok(f.tracks.every(track=>track.stopped));
  assert.equal(f.states.at(-1).clip.width,1280);
});
