import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoice} from '../public/js/voice.js';
import {createVoiceCall} from '../public/js/voice-call.js';

// Synthetic contract tests: each named test resolves only recovery/cancellation
// under injected media events and clocks. They cannot establish real provider,
// browser synthesis, audible speech, device, capture, or GPU reliability.
function clock(){let time=0,serial=0;const jobs=new Map();return {now:()=>time/1000,setTimer(fn,delay){const id=++serial;jobs.set(id,{at:time+delay,fn});return id;},clearTimer:id=>jobs.delete(id),queuedCallback:()=>[...jobs.values()].at(-1)?.fn,advance(ms){const end=time+ms;for(;;){const next=[...jobs].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;time=next[1].at;jobs.delete(next[0]);next[1].fn();}time=end;},get pending(){return jobs.size;}};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function natural({neverAccept=false}={}){
  const timer=clock(),players=[],errors=[],events=[];
  const voice=createVoice({...timer,onError:message=>errors.push(message),requestAudio:async()=>new Blob(['audio']),AudioContextCtor:null,
    AudioCtor:class{constructor(){this.paused=true;this.currentTime=0;players.push(this);}play(){this.paused=false;return neverAccept?new Promise(()=>{}):Promise.resolve();}pause(){this.paused=true;}},
    urls:{createObjectURL:()=>`blob:${players.length}`,revokeObjectURL(){}},
  });voice.configureNatural(true);voice.setEngine('natural');voice.setEnabled(true);
  const speak=text=>voice.speak(text,'companion','neutral',undefined,{onPlaybackStart:()=>events.push('start'),onPlaybackUnavailable:value=>events.push(value),onPlaybackError:value=>events.push(value)});
  return {voice,timer,players,errors,events,speak};
}

for(const neverAccept of [false,true])test(`natural playback that never starts fails recoverably, including unsettled play=${neverAccept}`,async()=>{
  const f=natural({neverAccept});const spoken=f.speak('Keep the text available.');await settle();
  f.timer.advance(15000);await settle();
  assert.equal(f.voice.state,'idle');assert.equal(f.players[0].paused,true);assert.equal(f.events.length,1);
  assert.equal(f.events[0].status,'unavailable');assert.match(f.errors[0],/timed out|stalled/i);assert.equal(f.timer.pending,0);await spoken;f.voice.stop();
});

test('a waiting media stall reports a late error while long progressing audio remains playable',async()=>{
  const f=natural();await f.speak('A long natural narration.');const player=f.players[0];player.onplaying();
  for(let second=1;second<=90;second++){player.currentTime=second;f.timer.advance(1000);}
  assert.equal(f.voice.state,'speaking');assert.deepEqual(f.errors,[]);
  player.onwaiting();f.timer.advance(10000);player.currentTime++;player.onplaying();f.timer.advance(1000);
  assert.equal(f.voice.state,'speaking');assert.deepEqual(f.errors,[]);
  player.onwaiting();f.timer.advance(15000);
  assert.equal(f.voice.state,'idle');assert.equal(f.events.at(-1).status,'error');assert.match(f.events.at(-1).message,/timed out|stalled/i);assert.equal(f.timer.pending,0);f.voice.stop();
});

test('stale watchdog callbacks after cancellation cannot end replacement audio',async()=>{
  const f=natural();await f.speak('Old narration.');const stale=f.timer.queuedCallback();f.voice.stop();await f.speak('Current narration.');
  const player=f.players[1],startup=f.timer.queuedCallback();player.onplaying();startup();assert.equal(f.timer.pending,1);
  stale();assert.equal(f.voice.state,'speaking');f.voice.stop();assert.equal(f.timer.pending,0);
  await f.speak('Another current narration.');const next=f.players[2];next.onplaying();
  for(let second=1;second<=30;second++){next.currentTime=second;f.timer.advance(1000);}
  assert.equal(f.voice.state,'speaking');assert.deepEqual(f.errors,[]);f.voice.stop();assert.equal(f.timer.pending,0);
});

test('browser synthesis missing start or completion reaches a recoverable voice error',async()=>{
  const previousSynth=globalThis.speechSynthesis,previousUtterance=globalThis.SpeechSynthesisUtterance;
  const spoken=[];globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  globalThis.speechSynthesis={cancel(){},getVoices:()=>[],speak:utterance=>spoken.push(utterance)};
  try{
    for(const started of [false,true]){
      const timer=clock(),errors=[],voice=createVoice({...timer,onError:message=>errors.push(message)});voice.setEnabled(true);await voice.speak('A short reply.');
      if(started)spoken.at(-1).onstart();timer.advance(120000);
      assert.equal(voice.state,'idle');assert.equal(errors.length,1);assert.match(errors[0],/timed out|stalled/i);assert.equal(timer.pending,0);voice.stop();
    }
  }finally{if(previousSynth===undefined)delete globalThis.speechSynthesis;else globalThis.speechSynthesis=previousSynth;if(previousUtterance===undefined)delete globalThis.SpeechSynthesisUtterance;else globalThis.SpeechSynthesisUtterance=previousUtterance;}
});

test('advancing browser word boundaries preserve slow narration beyond its initial completion allowance',async()=>{
  const previousSynth=globalThis.speechSynthesis,previousUtterance=globalThis.SpeechSynthesisUtterance;let utterance;
  globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  globalThis.speechSynthesis={cancel(){},getVoices:()=>[],speak:value=>{utterance=value;}};
  try{
    const timer=clock(),errors=[],voice=createVoice({...timer,onError:message=>errors.push(message)});voice.setEnabled(true);await voice.speak('word '.repeat(40));utterance.onstart();
    for(let index=1;index<=10;index++){timer.advance(20000);utterance.onboundary({name:'word',charIndex:index*10});}
    assert.equal(voice.state,'speaking');assert.deepEqual(errors,[]);utterance.onend();assert.equal(voice.state,'idle');assert.equal(timer.pending,0);voice.stop();
  }finally{if(previousSynth===undefined)delete globalThis.speechSynthesis;else globalThis.speechSynthesis=previousSynth;if(previousUtterance===undefined)delete globalThis.SpeechSynthesisUtterance;else globalThis.SpeechSynthesisUtterance=previousUtterance;}
});

test('a real voice playback watchdog moves its pending call to an explicit retryable error',async()=>{
  const timer=clock();let call,listens=0;
  const voice=createVoice({...timer,requestAudio:async()=>new Blob(['audio']),AudioContextCtor:null,
    AudioCtor:class{play(){return new Promise(()=>{});}pause(){}},urls:{createObjectURL:()=>'',revokeObjectURL(){}},
    onState:state=>call?.onVoiceState(state),onEnd:()=>call?.onVoiceEnd(),onError:message=>call?.fail(message),
  });voice.configureNatural(true);voice.setEngine('natural');voice.setEnabled(true);
  call=createVoiceCall({...timer,supported:true,startListening(){listens++;},stopListening(){},stopReply:()=>voice.stop(),submit:async()=>{void voice.speak('Read this reply.');return {reply:'Read this reply.',voicePending:true};}});
  call.connect();call.onListening(true);call.onTranscript('A question');await settle();
  timer.advance(15000);await settle();assert.equal(call.snapshot().status,'error');assert.match(call.snapshot().error,/stalled|timed out/i);assert.equal(call.snapshot().reply,'Read this reply.');
  assert.equal(listens,1);assert.equal(timer.pending,0);assert.equal(call.connect(),true);assert.equal(listens,2);call.dispose();voice.stop();
});
