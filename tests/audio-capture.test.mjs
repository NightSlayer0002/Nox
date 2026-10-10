import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecorder} from '../public/js/recorder.js';
import {createVoice} from '../public/js/voice.js';

test('video recording clones the voice audio track and never stops normal playback',()=>{
  const previous=globalThis.MediaRecorder,track={kind:'audio',stopped:false,stop(){this.stopped=true;},clone(){return {kind:'audio',stopped:false,stop(){this.stopped=true;}};}},video={kind:'video',stop(){this.stopped=true;}},tracks=[video],clips=[];
  globalThis.MediaRecorder=class{static isTypeSupported(type){return type.includes('opus');}constructor(stream){this.stream=stream;this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['recorded'])});this.onstop();}};
  try{
    const recorder=createRecorder({captureStream:()=>({addTrack:t=>tracks.push(t),getTracks:()=>tracks,getAudioTracks:()=>tracks.filter(t=>t.kind==='audio')})},(_active,clip)=>{if(clip)clips.push(clip);},{getAudioStream:()=>({getAudioTracks:()=>[track]})});
    recorder.start();assert.equal(tracks.length,2);assert.notEqual(tracks[1],track);recorder.stop();assert.equal(tracks[1].stopped,true);assert.equal(track.stopped,false);assert.equal(clips[0].audio,true);
  }finally{globalThis.MediaRecorder=previous;}
});

test('natural voice feeds both audible speakers and the reusable capture destination',async()=>{
  const links=[],destination={stream:{getAudioTracks:()=>[{kind:'audio'}]}},speakers={kind:'speakers'};let resumes=0,disconnects=0;
  class Context{constructor(){this.destination=speakers;}createMediaStreamDestination(){return destination;}resume(){resumes++;return Promise.resolve();}createMediaElementSource(){return {connect:node=>links.push(node),disconnect:()=>disconnects++};}}
  const voice=createVoice({AudioContextCtor:Context,AudioCtor:class{play(){this.onplaying?.();return Promise.resolve();}pause(){}},requestAudio:async()=>new Blob(['test']),urls:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}}});
  voice.configureNatural(true);voice.setEngine('natural');voice.setEnabled(true);
  assert.equal(voice.prepareCapture(),destination.stream);await voice.speak('Hello.');assert.deepEqual(links,[speakers,destination]);voice.stop();assert.equal(disconnects,1);assert.ok(resumes>=1);assert.equal(voice.prepareCapture(),destination.stream);
});

test('browser speech reports no capturable audio stream',()=>{
  const voice=createVoice();assert.equal(voice.prepareCapture(),null);
});
