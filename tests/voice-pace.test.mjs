import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoice } from '../public/js/voice.js';

const urls={createObjectURL:()=> 'blob:pace-test',revokeObjectURL(){}};
function naturalVoice(options={}){
  const players=[];
  const voice=createVoice({...options,urls,AudioContextCtor:null,requestAudio:options.requestAudio??(async()=>new Blob(['audio'])),AudioCtor:class{
    constructor(){this.currentTime=0;this.paused=true;players.push(this);}
    play(){this.paused=false;this.onplaying?.();return Promise.resolve();}
    pause(){this.paused=true;}
  }});
  voice.configureNatural(true);voice.setEngine('natural');voice.setEnabled(true);return {voice,players};
}

test('speech pace validates its supported range and changes current natural playback without restarting',async()=>{
  let requests=0,starts=0,ends=0,signal;
  const {voice,players}=naturalVoice({requestAudio:async(_text,_mode,s)=>{requests++;signal=s;return new Blob(['audio']);},onStart:()=>starts++,onEnd:()=>ends++});
  assert.equal(voice.pace,1);assert.equal(voice.setPace(.75),.75);
  await voice.speak('An uninterrupted thought.');
  assert.equal(players[0].playbackRate,1.04*.75);const before={requests,starts,ends};
  assert.equal(voice.setPace(1.25),1.25);assert.equal(players[0].playbackRate,1.3);
  assert.deepEqual({requests,starts,ends},before);assert.equal(signal.aborted,false);assert.equal(players[0].paused,false);
  for(const invalid of [0,2,NaN,Infinity,'1.1',null,undefined]){assert.equal(voice.setPace(invalid),1);assert.equal(players[0].playbackRate,1.04);}
  voice.stop();
});

test('prepared and later natural clips adopt the latest pace without refetching or cancelling the sequence',async()=>{
  let requests=0,signal;
  async function* clips(){yield {blob:new Blob(['first'])};yield {blob:new Blob(['second'])};}
  const {voice,players}=naturalVoice({requestClips:(_text,_mode,s)=>{requests++;signal=s;return clips();}});
  await voice.prepare('Two parts. Same sequence.');voice.setPace(.9);await voice.speak('Two parts. Same sequence.');
  assert.equal(players[0].playbackRate,1.04*.9);voice.setPace(1.2);players[0].onended();
  for(let i=0;i<12&&players.length<2;i++)await Promise.resolve();
  assert.equal(players.length,2);assert.equal(players[1].playbackRate,1.04*1.2);assert.equal(requests,1);assert.equal(signal.aborted,false);
  voice.stop();
});

test('natural mouth amplitude follows actual media time after a pace change',async()=>{
  const {voice,players}=naturalVoice({requestClips:async function*(){yield {blob:new Blob(['wav']),envelope:{step:.1,levels:[0,.8,.2,0]}};}});
  await voice.speak('A measured thought.');
  players[0].currentTime=.11;assert.equal(voice.mouthLevel,.8);
  voice.setPace(1.25);assert.equal(voice.mouthLevel,.8);
  players[0].currentTime=.21;assert.equal(voice.mouthLevel,.2);
  players[0].currentTime=.31;assert.equal(voice.mouthLevel,0);voice.stop();
});

test('browser speech applies pace per utterance and preserves emotion timing without cancelling current speech',async()=>{
  const previousSynth=globalThis.speechSynthesis,previousUtterance=globalThis.SpeechSynthesisUtterance,spoken=[];let cancels=0;
  globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  globalThis.speechSynthesis={cancel(){cancels++;},getVoices:()=>[],speak:utterance=>spoken.push(utterance)};
  const voice=createVoice();
  try{
    voice.setEnabled(true);voice.setPace(.8);await voice.speak('Hello. Another sentence.','companion','happy');
    assert.equal(spoken[0].rate,1.04*.8);spoken[0].onstart();const before=cancels;
    voice.setPace(1.2);assert.equal(cancels,before);assert.equal(voice.state,'speaking');
    spoken[0].onend();await new Promise(resolve=>setTimeout(resolve,210));
    assert.equal(spoken[1].rate,1.04*1.2);
  }finally{
    voice.stop();if(previousSynth===undefined)delete globalThis.speechSynthesis;else globalThis.speechSynthesis=previousSynth;
    if(previousUtterance===undefined)delete globalThis.SpeechSynthesisUtterance;else globalThis.SpeechSynthesisUtterance=previousUtterance;
  }
});
