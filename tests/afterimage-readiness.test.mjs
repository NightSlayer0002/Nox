import test from 'node:test';
import assert from 'node:assert/strict';
import {createAfterimageBridge} from '../public/js/afterimage-bridge.js';
import {buildSelectedPerformance,createAfterimageController} from '../public/js/afterimage-engine.js';
import {createVoice} from '../public/js/voice.js';
import {FIRST_CONTACT} from '../client/afterimage-example.js';

function clock(){
  let time=0,serial=0;const jobs=new Map();
  return {now:()=>time,setTimer(fn,delay){const id=++serial;jobs.set(id,{at:time+delay,fn});return id;},clearTimer:id=>jobs.delete(id),
    advance(ms){const until=time+ms;for(;;){const next=[...jobs].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>until)break;time=next[1].at;jobs.delete(next[0]);next[1].fn();}time=until;},
    get pending(){return jobs.size;},
  };
}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function naturalFixture({delayedPlayback=false}={}){
  const timer=clock(),requests=[],events=[],players=[],errors=[],target=new EventTarget();target.hidden=false;
  const playback=deferred();let recording=false;
  const voice=createVoice({
    requestAudio:(text,mode,signal,emotion,speaker,cues)=>new Promise((resolve,reject)=>requests.push({text,mode,signal,emotion,speaker,cues,resolve,reject})),
    AudioCtor:class{
      constructor(){this.paused=true;players.push(this);}
      play(){events.push({type:'audio',at:timer.now()});this.paused=false;this.onplaying?.();return delayedPlayback?playback.promise:Promise.resolve();}
      pause(){this.paused=true;}
    },
    urls:{createObjectURL:()=>`blob:rehearsal-${players.length}`,revokeObjectURL(){}},onError:message=>errors.push(message),
  });
  voice.configureNatural(true);voice.setEngine('natural');voice.setEnabled(true);
  const bridge=createAfterimageBridge({...timer,visibilityTarget:target});
  const disconnect=bridge.connect({
    prepare:(script,emotion,cues)=>voice.prepare(script,'companion',emotion,cues).then(Boolean),
    speak:(script,emotion,cues)=>voice.speak(script,'companion',emotion,cues),
    cue:cue=>events.push({type:'cue',text:cue.speech,at:timer.now()}),
    stop:()=>voice.stop(),
    startRecording(){recording=true;events.push({type:'capture',at:timer.now()});},
    stopRecording(){recording=false;events.push({type:'saved',at:timer.now()});},
    getState:()=>({voiceEnabled:voice.enabled,recording,recordSupported:true}),
  });
  return {timer,voice,bridge,disconnect,requests,events,players,errors,target,playback};
}

test('slow natural preparation spends none of the rehearsal or capture before audio is ready',async t=>{
  const f=naturalFixture();t.after(()=>f.bridge.dispose());
  assert.equal(f.bridge.recordAndPlay(FIRST_CONTACT),true);
  assert.equal(f.requests.length,1);
  assert.equal(f.bridge.snapshot().status,'playing');assert.equal(f.bridge.snapshot().preparing,true);
  f.timer.advance(90000);
  assert.equal(f.bridge.snapshot().elapsedMs,0);assert.equal(f.bridge.snapshot().recording,false);assert.deepEqual(f.events,[]);
  f.requests[0].resolve(new Blob(['the selected narration']));await settle();
  assert.equal(f.requests.length,1);assert.equal(f.bridge.snapshot().preparing,false);
  assert.deepEqual(f.events.map(({type,at})=>({type,at})),[{type:'capture',at:90000},{type:'audio',at:90000},{type:'cue',at:90000}]);
  f.timer.advance(7000);assert.equal(f.events.filter(event=>event.type==='cue').length,2);
  f.timer.advance(21000);
  assert.equal(f.bridge.snapshot().status,'complete');assert.equal(f.bridge.snapshot().recording,false);
  assert.deepEqual(f.events.filter(event=>event.type==='cue').map(event=>event.at),[90000,97000,104000,111000]);
  assert.deepEqual(f.events.at(-1),{type:'saved',at:118000});assert.equal(f.timer.pending,0);
});

test('the cue clock waits for the first playback promise after prepared audio reaches the player',async t=>{
  const f=naturalFixture({delayedPlayback:true});t.after(()=>f.bridge.dispose());
  f.bridge.recordAndPlay(FIRST_CONTACT);f.requests[0].resolve(new Blob(['prepared narration']));await settle();
  assert.equal(f.bridge.snapshot().recording,true);assert.equal(f.players.length,1);
  f.timer.advance(10000);
  assert.equal(f.bridge.snapshot().elapsedMs,0);assert.equal(f.bridge.snapshot().preparing,true);
  assert.equal(f.events.filter(event=>event.type==='cue').length,0);
  f.playback.resolve();await settle();f.timer.advance(7000);
  assert.deepEqual(f.events.filter(event=>event.type==='cue').map(event=>event.at),[10000,17000]);
  assert.equal(f.bridge.snapshot().elapsedMs,7000);
});

test('failed natural preparation continues a captioned capture without a provider retry or voice substitution',async t=>{
  const f=naturalFixture();t.after(()=>f.bridge.dispose());
  f.bridge.recordAndPlay(FIRST_CONTACT);f.timer.advance(12000);f.requests[0].reject(Error('Speech quota exceeded.'));await settle();
  assert.equal(f.requests.length,1);assert.equal(f.players.length,0);assert.equal(f.voice.engine,'natural');
  assert.equal(f.bridge.snapshot().status,'playing');assert.equal(f.bridge.snapshot().preparing,false);
  assert.equal(f.bridge.snapshot().captionsOnly,true);assert.match(f.bridge.snapshot().voiceError,/caption/i);
  assert.equal(f.bridge.snapshot().recording,true);f.timer.advance(28000);
  assert.equal(f.bridge.snapshot().status,'complete');assert.equal(f.events.filter(event=>event.type==='cue').length,4);
  assert.equal(f.events.filter(event=>event.type==='saved').length,1);
});

for(const action of ['stop','hidden','disconnect','dispose'])test(`${action} during voice preparation cancels it and prevents late capture`,async t=>{
  const f=naturalFixture();t.after(()=>f.bridge.dispose());f.bridge.recordAndPlay(FIRST_CONTACT);
  if(action==='stop')f.bridge.stop('navigation');
  else if(action==='hidden'){f.target.hidden=true;f.target.dispatchEvent(new Event('visibilitychange'));}
  else if(action==='disconnect')f.disconnect();
  else f.bridge.dispose();
  assert.equal(f.requests[0].signal.aborted,true);
  f.requests[0].resolve(new Blob(['obsolete narration']));await settle();f.timer.advance(90000);
  assert.equal(f.players.length,0);assert.deepEqual(f.events,[]);assert.equal(f.timer.pending,0);
  assert.notEqual(f.bridge.snapshot().status,'playing');
});

test('replacing a pending cut ignores its late readiness and captures only the replacement',async t=>{
  const f=naturalFixture();t.after(()=>f.bridge.dispose());f.bridge.recordAndPlay(FIRST_CONTACT,0,0);
  f.bridge.recordAndPlay(FIRST_CONTACT,0,1);assert.equal(f.requests.length,2);assert.equal(f.requests[0].signal.aborted,true);
  f.requests[0].resolve(new Blob(['obsolete narration']));await settle();assert.deepEqual(f.events,[]);
  f.requests[1].resolve(new Blob(['current narration']));await settle();f.timer.advance(28000);
  assert.equal(f.events.filter(event=>event.type==='capture').length,1);assert.equal(f.events.filter(event=>event.type==='audio').length,1);
  assert.equal(f.events.filter(event=>event.type==='cue').at(-1).text,FIRST_CONTACT.signals[0].endings[1].speech);
  assert.equal(f.bridge.snapshot().status,'complete');
});

test('AbortSignal cancellation invalidates an unresolved preparation callback',async()=>{
  const timer=clock(),preparation=deferred(),abort=new AbortController(),cues=[],stops=[];
  const controller=createAfterimageController({...timer,onPrepare:()=>preparation.promise,onCue:cue=>cues.push(cue),onStop:reason=>stops.push(reason)});
  controller.play(buildSelectedPerformance(FIRST_CONTACT),{signal:abort.signal});abort.abort();preparation.resolve(true);await settle();
  assert.equal(controller.snapshot().reason,'aborted');assert.deepEqual(stops,['aborted']);assert.deepEqual(cues,[]);assert.equal(timer.pending,0);controller.dispose();
});

test('a rejected first-audio playback still delivers all four caption cues',async()=>{
  const timer=clock(),cues=[],controller=createAfterimageController({...timer,onSpeak:()=>Promise.reject(Error('Autoplay denied.')),onCue:cue=>cues.push(cue)});
  controller.play(buildSelectedPerformance(FIRST_CONTACT));await settle();
  assert.equal(controller.snapshot().captionsOnly,true);assert.match(controller.snapshot().voiceError,/caption/i);
  timer.advance(28000);assert.equal(cues.length,4);assert.equal(controller.snapshot().status,'complete');controller.dispose();
});

test('stopping while first playback is pending prevents its late promise from restarting the clock',async t=>{
  const f=naturalFixture({delayedPlayback:true});t.after(()=>f.bridge.dispose());
  f.bridge.recordAndPlay(FIRST_CONTACT);f.requests[0].resolve(new Blob(['prepared narration']));await settle();
  f.bridge.stop('navigation');f.playback.resolve();await settle();f.timer.advance(60000);
  assert.equal(f.bridge.snapshot().reason,'navigation');assert.equal(f.bridge.snapshot().recording,false);
  assert.equal(f.events.filter(event=>event.type==='cue').length,0);assert.equal(f.events.filter(event=>event.type==='saved').length,1);assert.equal(f.timer.pending,0);
});

test('narration still speaking at 28 seconds keeps the final cue and capture until it ends',()=>{
  const timer=clock(),cues=[],events=[];let speaking=true,recording=false;
  const bridge=createAfterimageBridge(timer);bridge.connect({
    cue:cue=>cues.push(cue),speak(){speaking=true;},isSpeaking:()=>speaking,stop(){speaking=false;},
    startRecording(){recording=true;},stopRecording(){recording=false;events.push(timer.now());},
    getState:()=>({recording,recordSupported:true,voiceEnabled:true}),
  });
  bridge.recordAndPlay(FIRST_CONTACT);timer.advance(28000);
  assert.equal(bridge.snapshot().status,'playing');assert.equal(bridge.snapshot().recording,true);assert.equal(cues.length,4);
  timer.advance(5000);assert.equal(bridge.snapshot().elapsedMs,33000);assert.ok(bridge.snapshot().durationMs>=33000);
  assert.equal(cues.length,4);speaking=false;timer.advance(250);
  assert.equal(bridge.snapshot().status,'complete');assert.equal(bridge.snapshot().elapsedMs,33250);assert.equal(bridge.snapshot().durationMs,33250);
  assert.deepEqual(events,[33250]);assert.equal(timer.pending,0);bridge.dispose();
});

test('a stale speaking signal cannot extend narration or owned capture past the recorder limit',()=>{
  const timer=clock(),stops=[],controller=createAfterimageController({...timer,onSpeaking:()=>true,onStop:reason=>stops.push(reason)});
  controller.play(buildSelectedPerformance(FIRST_CONTACT));timer.advance(60000);
  assert.equal(controller.snapshot().status,'complete');assert.equal(controller.snapshot().elapsedMs,60000);assert.equal(controller.snapshot().durationMs,60000);
  assert.deepEqual(stops,['complete']);assert.equal(timer.pending,0);controller.dispose();
});

test('navigation from the recorder start callback releases the newly owned asynchronous capture',async()=>{
  const timer=clock(),preparation=deferred();let recording=false,saves=0;
  const bridge=createAfterimageBridge(timer);bridge.connect({
    prepare:()=>preparation.promise,cue(){},speak(){},stop(){},
    startRecording(){recording=true;bridge.stop('navigation');},stopRecording(){recording=false;saves++;},
    getState:()=>({recording,recordSupported:true,voiceEnabled:true}),
  });
  bridge.recordAndPlay(FIRST_CONTACT);preparation.resolve(true);await settle();
  assert.equal(bridge.snapshot().reason,'navigation');assert.equal(recording,false);assert.equal(saves,1);assert.equal(timer.pending,0);bridge.dispose();
});

test('an unrelated manual recording started during preparation is never adopted by the waiting cut',async()=>{
  const timer=clock(),preparation=deferred();let recording=false,starts=0,saves=0;
  const bridge=createAfterimageBridge(timer);bridge.connect({
    prepare:()=>preparation.promise,cue(){},speak(){},stop(){},
    startRecording(){recording=true;starts++;},stopRecording(){recording=false;saves++;},
    getState:()=>({recording,recordSupported:true,voiceEnabled:true}),
  });
  bridge.recordAndPlay(FIRST_CONTACT);recording=true;preparation.resolve(true);await settle();
  assert.equal(starts,0);assert.equal(bridge.snapshot().status,'stopped');assert.equal(bridge.snapshot().reason,'error');
  assert.equal(recording,true);assert.equal(saves,0);assert.equal(timer.pending,0);bridge.dispose();assert.equal(recording,true);
});
