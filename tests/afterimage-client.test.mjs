import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSelectedPerformance, createAfterimageController, toMarkdown } from '../public/js/afterimage-engine.js';
import { createAfterimageStore, AFTERIMAGE_STORAGE_KEY } from '../public/js/afterimage-store.js';
import { createAfterimageBridge, applyAfterimageCue } from '../public/js/afterimage-bridge.js';
import { createRecorder } from '../public/js/recorder.js';
import { createVoice } from '../public/js/voice.js';
import { Stage } from '../public/js/stage.js';
import { Face } from '../public/js/face.js';

function packet(title='A second moon') {
  return { title, anchor:'A bell rings under the sea.', caption:'A transmission from a reality you have not made.', signals: Array.from({length:3},(_,i)=>({
    label:`Signal ${i+1}`, premise:`A lighthouse wakes in room ${i+1}.`,
    beats:[{speech:'The door opens.',emotion:'curious',action:'spotlight'},{speech:'A second moon waits.',emotion:'surprised',action:'orbit'},{speech:'You hear your own answer.',emotion:'uncanny',action:'echo'}],
    endings:[{label:'Follow',speech:'We step through together.',emotion:'happy',action:'takeover'},{label:'Return',speech:'We carry the light home.',emotion:'neutral',action:'none'}],
  })) };
}
function clock() {
  let time=0,serial=0;const jobs=new Map(),all=[];
  return { now:()=>time, setTimer(fn,delay){const id=++serial;jobs.set(id,{at:time+delay,fn});all.push(fn);return id;},clearTimer:id=>jobs.delete(id),
    advance(ms){const until=time+ms;for(;;){const next=[...jobs].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>until)break;time=next[1].at;jobs.delete(next[0]);next[1].fn();}time=until;},
    get pending(){return jobs.size;}, get callbacks(){return all;},
  };
}
function disk(initial) { const map=new Map(initial);return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)}; }
function adapters() {
  const cues=[],spoken=[],stops=[];let recording=false,voiceEnabled=true,starts=0,recordStops=0;
  return { cues,spoken,stops,get starts(){return starts;},get recordStops(){return recordStops;},
    adapter:{cue:value=>cues.push(value),speak:(...args)=>spoken.push(args),stop:reason=>stops.push(reason),receive:async()=>({packet:packet(),metrics:{provider:'groq',model:'configured',totalMs:4,cacheHit:false}}),
      getState:()=>({voiceEnabled,recording,recordSupported:true,connection:{kind:'live',provider:{id:'groq',name:'Groq',model:'configured'}}}),
      startRecording(){recording=true;starts++;},stopRecording(){recording=false;recordStops++;},record(){recording=!recording;},setVoice:value=>voiceEnabled=value,
    },
  };
}

test('selected performance keeps four allowlisted cues and uses the chosen ending',()=>{
  const performance=buildSelectedPerformance(packet(),1,1);
  assert.deepEqual(performance.cues.map(c=>c.speech),['The door opens.','A second moon waits.','You hear your own answer.','We carry the light home.']);
  assert.equal(performance.script,'The door opens.\nA second moon waits.\nYou hear your own answer.\nWe carry the light home.');
  assert.equal(performance.signalLabel,'Signal 2');assert.equal(performance.endingLabel,'Return');
  const edited=buildSelectedPerformance(packet(),0,0,['a'.repeat(120),'b'.repeat(100),'c'.repeat(100),'d'.repeat(100)]);
  assert.equal(edited.script.length,363);assert.equal(edited.cues[0].action,'spotlight');
  assert.throws(()=>buildSelectedPerformance(packet(),3,0),RangeError);assert.throws(()=>buildSelectedPerformance(packet(),0,-1),RangeError);
  assert.throws(()=>buildSelectedPerformance(packet(),0,0,['blank','','three','four']),TypeError);
  const unsafe=packet();unsafe.signals[0].beats[0].action='fetch-url';assert.equal(buildSelectedPerformance(unsafe,0,0).cues[0].action,'none');
});

test('playback sends cues at 0, 7, 14 and 21 seconds and stops speech at 28',()=>{
  const timer=clock(),cues=[],spoken=[],stops=[],states=[];
  const controller=createAfterimageController({...timer,onCue:cue=>cues.push({text:cue.speech,at:timer.now()}),onSpeak:text=>spoken.push(text),onStop:reason=>stops.push(reason)});
  controller.subscribe(value=>states.push(value));controller.play(buildSelectedPerformance(packet(),0,0));
  assert.equal(cues.length,1);timer.advance(6999);assert.equal(cues.length,1);timer.advance(1);assert.equal(cues.length,2);
  timer.advance(21000);assert.deepEqual(cues.map(c=>c.at),[0,7000,14000,21000]);assert.equal(spoken.length,1);
  assert.equal(controller.snapshot().status,'complete');assert.equal(controller.snapshot().elapsedMs,28000);assert.equal(timer.pending,0);assert.deepEqual(stops,['complete']);
  assert.ok(states.some(s=>s.cueIndex===3));controller.dispose();
});

test('obsolete timer callbacks and stopped runs cannot cue or end a replacement',()=>{
  const timer=clock(),cues=[],spoken=[];
  const controller=createAfterimageController({...timer,onCue:cue=>cues.push(cue.speech),onSpeak:text=>spoken.push(text)});
  controller.play(buildSelectedPerformance(packet('Old'),0,0));const obsolete=timer.callbacks[0];
  controller.play(buildSelectedPerformance(packet('New'),0,1));obsolete();assert.equal(cues.length,2);
  timer.advance(7000);assert.equal(cues.length,3);controller.stop('user');timer.advance(40000);obsolete();
  assert.equal(cues.length,3);assert.equal(controller.snapshot().reason,'user');assert.equal(timer.pending,0);assert.equal(spoken.length,2);
  controller.dispose();assert.equal(controller.play(buildSelectedPerformance(packet(),0,0)),false);
});

test('hidden tabs and AbortSignal cancellation release playback timers and listeners',()=>{
  const timer=clock(),target=new EventTarget();target.hidden=false;let stops=0;
  const controller=createAfterimageController({...timer,visibilityTarget:target,onStop:()=>stops++});
  const abort=new AbortController();controller.play(buildSelectedPerformance(packet(),0,0),{signal:abort.signal});abort.abort();
  assert.equal(controller.snapshot().reason,'aborted');assert.equal(timer.pending,0);
  controller.play(buildSelectedPerformance(packet(),0,0));target.hidden=true;target.dispatchEvent(new Event('visibilitychange'));
  assert.equal(controller.snapshot().reason,'hidden');assert.equal(timer.pending,0);assert.equal(controller.play(buildSelectedPerformance(packet(),0,0)),false);
  controller.dispose();target.dispatchEvent(new Event('visibilitychange'));assert.equal(stops,2);
});

test('a cue failure cancels speech and prevents the rest of the performance',()=>{
  const timer=clock(),stops=[];let count=0;
  const controller=createAfterimageController({...timer,onCue:()=>{if(++count===2)throw Error('stage unavailable');},onStop:reason=>stops.push(reason)});
  controller.play(buildSelectedPerformance(packet(),0,0));timer.advance(7000);timer.advance(30000);
  assert.equal(count,2);assert.equal(controller.snapshot().status,'stopped');assert.equal(controller.snapshot().reason,'error');assert.equal(timer.pending,0);assert.deepEqual(stops,['error']);
});

test('a subscriber can stop the first cue without leaving an erroneous run or speaking',()=>{
  const timer=clock(),cues=[],spoken=[],controller=createAfterimageController({...timer,onCue:value=>cues.push(value),onSpeak:value=>spoken.push(value)});
  controller.subscribe(state=>{if(state.status==='playing')controller.stop('subscriber');});
  assert.equal(controller.play(buildSelectedPerformance(packet(),0,0)),false);
  assert.equal(controller.snapshot().reason,'subscriber');assert.equal(cues.length,0);assert.equal(spoken.length,0);assert.equal(timer.pending,0);
});

test('completion cleans the old speech before subscribers begin a replacement',()=>{
  const timer=clock(),events=[],controller=createAfterimageController({...timer,onSpeak:()=>events.push('speak'),onStop:reason=>events.push(reason)});
  controller.subscribe(state=>{if(state.status==='complete')controller.play(buildSelectedPerformance(packet(),0,1));});
  controller.play(buildSelectedPerformance(packet(),0,0));timer.advance(28000);
  assert.deepEqual(events,['speak','complete','speak']);assert.equal(controller.snapshot().status,'playing');controller.dispose();
});

test('receptions persist at most twelve and explicit deletion cannot revive in a stale store',()=>{
  const storage=disk(),store=createAfterimageStore(storage);for(let i=0;i<14;i++)store.add({packet:packet(`Take ${i}`),seed:`Seed ${i}`,tone:'wonder',source:'live'});
  assert.equal(store.list().length,12);assert.equal(store.list()[0].packet.title,'Take 13');assert.equal(store.list().at(-1).packet.title,'Take 2');
  const stale=createAfterimageStore(storage),id=store.list()[0].id;assert.equal(store.remove(id),true);assert.equal(stale.update(id,{endingIndex:1}),null);
  stale.add({packet:packet('Newest'),seed:'Another thought',tone:'bold',source:'authored'});
  const reloaded=createAfterimageStore(storage);assert.equal(reloaded.get(id),null);assert.equal(reloaded.list().length,12);
  reloaded.clear();assert.equal(createAfterimageStore(storage).list().length,0);assert.equal(JSON.parse(reloaded.export()).receptions.length,0);
});

test('local edits, branch choices and export survive reload without changing authored packet',()=>{
  const storage=disk(),store=createAfterimageStore(storage),entry=store.add({packet:packet(),seed:'A lighthouse',tone:'uncanny',source:'authored'});
  const original=entry.packet.signals[0].beats[0].speech;
  store.update(entry.id,{signalIndex:1,endingIndex:1,editedLines:['One','Two','Three','Four']});
  const saved=createAfterimageStore(storage).get(entry.id);assert.deepEqual(saved.editedLines,['One','Two','Three','Four']);assert.equal(saved.packet.signals[0].beats[0].speech,original);
  assert.match(toMarkdown(saved),/00:21–00:28/);assert.match(toMarkdown(saved),/Four/);assert.match(toMarkdown(saved),/authored/);
  const exported=JSON.parse(store.export(entry.id));assert.equal(exported.id,entry.id);assert.equal(exported.endingIndex,1);
  const updated=store.update(entry.id,{endingIndex:0});assert.equal(updated.editedLines,undefined);assert.equal(updated.signalIndex,1);
  assert.throws(()=>store.update(entry.id,{editedLines:['One','','Three','Four']}),TypeError);
});

test('corrupt, incompatible and unavailable storage stay usable and bounded',()=>{
  for(const value of ['bad json',JSON.stringify({version:999,receptions:[]}),JSON.stringify({version:1,receptions:[{id:'malicious',packet:{signals:[]}}]})]){
    const store=createAfterimageStore(disk([[AFTERIMAGE_STORAGE_KEY,value]]));assert.equal(store.list().length,0);assert.doesNotThrow(()=>store.add({packet:packet(),source:'authored',seed:'Hi',tone:'wonder'}));
  }
  const unavailable={getItem(){throw Error('blocked');},setItem(){throw Error('quota');},removeItem(){throw Error('blocked');}},store=createAfterimageStore(unavailable);
  for(let i=0;i<15;i++)store.add({packet:packet(),source:'live',seed:'Hi',tone:'bold'});
  assert.equal(store.persistent,false);assert.equal(store.list().length,12);store.clear();assert.equal(store.list().length,0);
  const quota=disk();quota.setItem=()=>{throw Error('full');};const limited=createAfterimageStore(quota),entry=limited.add({packet:packet(),source:'live',seed:'Hi',tone:'bold'});
  assert.equal(limited.persistent,false);assert.equal(limited.get(entry.id).packet.title,'A second moon');
});

test('store snapshots prevent mutation and omit arbitrary fields and provider credentials',()=>{
  const storage=disk(),store=createAfterimageStore(storage),entry=store.add({packet:packet(),seed:'Hi',tone:'wonder',source:'live',secret:'no',metrics:{provider:'groq',model:'configured',totalMs:12,cacheHit:true,attempts:2,apiKey:'secret'}});
  assert.throws(()=>entry.packet.signals[0].beats[0].action='not-allowed',TypeError);assert.doesNotMatch(store.export(),/secret|apiKey/);
  assert.equal(createAfterimageStore(storage).get(entry.id).metrics.attempts,2);
  const invalid=store.add({packet:packet(),seed:'Hi',tone:'wonder',source:'live',metrics:{attempts:{apiKey:'secret'}}});assert.equal(invalid.metrics.attempts,undefined);assert.doesNotMatch(store.export(),/secret|apiKey/);
  assert.equal(store.snapshot(),store.snapshot());let calls=0;const unsubscribe=store.subscribe(()=>calls++);store.remove(entry.id);unsubscribe();store.clear();assert.equal(calls,1);
});

test('bridge sends one full voice script and capture finishes automatically after four cues',()=>{
  const timer=clock(),output=adapters(),bridge=createAfterimageBridge(timer);bridge.connect(output.adapter);
  bridge.recordAndPlay(packet(),0,1);assert.equal(output.starts,1);assert.equal(bridge.snapshot().recording,true);
  assert.equal(output.spoken.length,1);assert.equal(output.spoken[0][0],'The door opens.\nA second moon waits.\nYou hear your own answer.\nWe carry the light home.');
  timer.advance(28000);assert.equal(output.cues.length,4);assert.equal(output.recordStops,1);assert.equal(bridge.snapshot().recording,false);assert.equal(bridge.snapshot().status,'complete');bridge.dispose();
});

test('bridge stop releases owned capture but preserves unrelated manual recordings',()=>{
  const timer=clock(),output=adapters(),bridge=createAfterimageBridge(timer);bridge.connect(output.adapter);
  bridge.record();assert.equal(bridge.snapshot().recording,true);assert.throws(()=>bridge.recordAndPlay(packet(),0,0),/recording/i);
  bridge.play(packet(),0,0);bridge.stop('navigation');assert.equal(output.recordStops,0);assert.equal(bridge.snapshot().recording,true);
  bridge.record();bridge.recordAndPlay(packet(),0,0);bridge.stop('hidden');assert.equal(output.recordStops,1);assert.equal(bridge.snapshot().recording,false);assert.equal(timer.pending,0);bridge.dispose();
});

test('bridge aborts in-flight reception and discards obsolete responses even if fetch ignores signal',async()=>{
  const timer=clock(),output=adapters(),pending=[],bridge=createAfterimageBridge(timer);
  output.adapter.receive=request=>new Promise(resolve=>pending.push({request,resolve}));bridge.connect(output.adapter);
  const first=bridge.receive({seed:'First',tone:'wonder'}),firstCheck=assert.rejects(first,{name:'AbortError'});
  const second=bridge.receive({seed:'Second',tone:'bold'});assert.equal(pending[0].request.signal.aborted,true);
  pending[0].resolve({packet:packet('Old')});await firstCheck;
  pending[1].resolve({packet:packet('Fresh'),metrics:{provider:'groq',model:'configured',totalMs:4,cacheHit:false}});assert.equal((await second).packet.title,'Fresh');
  const external=new AbortController(),third=bridge.receive({seed:'Third',tone:'uncanny',signal:external.signal}),thirdCheck=assert.rejects(third,{name:'AbortError'});
  external.abort();assert.equal(pending[2].request.signal.aborted,true);pending[2].resolve({packet:packet()});await thirdCheck;bridge.dispose();
});

test('receiving a new take stops an active performance before making the protected request',async()=>{
  const timer=clock(),output=adapters(),bridge=createAfterimageBridge(timer);bridge.connect(output.adapter);bridge.recordAndPlay(packet(),0,0);
  await bridge.receive({seed:'New take',tone:'bold'});assert.equal(bridge.snapshot().status,'stopped');assert.equal(timer.pending,0);assert.equal(output.recordStops,1);bridge.dispose();
});

test('hidden tabs abort pending receive and stale transport errors become cancellation',async()=>{
  const target=new EventTarget();target.hidden=false;const output=adapters(),bridge=createAfterimageBridge({visibilityTarget:target});let pending;
  output.adapter.receive=request=>new Promise((resolve,reject)=>pending={request,reject});bridge.connect(output.adapter);
  const work=bridge.receive({seed:'Hidden take',tone:'wonder'}),check=assert.rejects(work,{name:'AbortError'});
  target.hidden=true;target.dispatchEvent(new Event('visibilitychange'));assert.equal(pending.request.signal.aborted,true);pending.reject(Error('Transport ended'));await check;bridge.dispose();
});

test('bridge validates live packets and strips unexpected metrics before UI gets them',async()=>{
  const output=adapters(),bridge=createAfterimageBridge();bridge.connect(output.adapter);
  output.adapter.receive=async()=>({packet:packet(),metrics:{provider:'groq',model:'configured',totalMs:2,cacheHit:false,apiKey:'private'}});
  const result=await bridge.receive({seed:'Hi',tone:'wonder'});assert.equal(result.metrics.apiKey,undefined);
  output.adapter.receive=async()=>{const unsafe=packet();unsafe.signals[2].endings[1].emotion='invented';return {packet:unsafe};};
  assert.equal((await bridge.receive({seed:'Hi',tone:'wonder'})).packet.signals[2].endings[1].emotion,'neutral');
  output.adapter.receive=async()=>({packet:{...packet(),command:'execute'}});await assert.rejects(bridge.receive({seed:'Hi',tone:'wonder'}),TypeError);bridge.dispose();
});

test('bridge refresh publishes unlock and voice changes and disconnect cancels its own work',()=>{
  const timer=clock(),output=adapters(),bridge=createAfterimageBridge(timer),disconnect=bridge.connect(output.adapter);let calls=0;
  const unsub=bridge.subscribe(()=>calls++);bridge.setVoice(false);assert.equal(bridge.snapshot().voiceEnabled,false);
  const currentState=output.adapter.getState;output.adapter.getState=()=>({...currentState(),connection:{kind:'locked'},voiceEnabled:false});bridge.refreshState();assert.equal(bridge.snapshot().connection.kind,'locked');
  bridge.recordAndPlay(packet(),0,0);disconnect();assert.equal(bridge.snapshot().connected,false);assert.equal(output.recordStops,1);assert.equal(timer.pending,0);assert.ok(calls>1);unsub();bridge.dispose();
});

test('capture stops the existing recorder at 28s and waits for its encoded clip to finalize',()=>{
  const previous=globalThis.MediaRecorder,instances=[],timer=clock(),tracks=[],clips=[];let bridge;
  globalThis.MediaRecorder=class {
    static isTypeSupported(){return true;}
    constructor(){this.state='inactive';this.stops=0;instances.push(this);}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.stops++;}
  };
  try{
    const recorder=createRecorder({captureStream(){const track={stopped:false,stop(){this.stopped=true;}};tracks.push(track);return {getTracks:()=>[track]};}},(active,clip)=>{if(clip)clips.push(clip);bridge?.refreshState();});
    bridge=createAfterimageBridge(timer);bridge.connect({cue(){},speak(){},stop(){},startRecording:()=>recorder.start(),stopRecording:()=>recorder.stop(),getState:()=>({recording:recorder.active,recordSupported:recorder.supported,voiceEnabled:false})});
    bridge.recordAndPlay(packet(),0,0);timer.advance(28000);
    assert.equal(instances[0].stops,1);assert.equal(recorder.active,true);assert.equal(tracks[0].stopped,false);assert.equal(bridge.snapshot().status,'complete');
    assert.throws(()=>bridge.recordAndPlay(packet(),0,0),/recording/i);
    instances[0].ondataavailable({data:new Blob(['encoded scene'])});instances[0].onstop();
    assert.equal(recorder.active,false);assert.equal(tracks[0].stopped,true);assert.equal(clips.length,1);assert.equal(clips[0].blob.size,13);assert.equal(bridge.snapshot().recording,false);
    URL.revokeObjectURL(clips[0].url);bridge.dispose();
  }finally{if(previous===undefined)delete globalThis.MediaRecorder;else globalThis.MediaRecorder=previous;}
});

test('bridge Stop cancels one full natural-voice request before audio can begin',async()=>{
  const timer=clock(),requests=[],played=[];
  const voice=createVoice({requestAudio:(text,mode,signal)=>new Promise(resolve=>requests.push({text,signal,resolve})),AudioCtor:class{play(){played.push(this);return Promise.resolve();}pause(){}},urls:{createObjectURL:()=> 'blob:afterimage',revokeObjectURL(){}}});
  voice.configureNatural(true);voice.setEngine('natural');voice.setEnabled(true);
  const bridge=createAfterimageBridge(timer);bridge.connect({cue(){},speak:text=>voice.speak(text),stop:()=>voice.stop(),getState:()=>({voiceEnabled:voice.enabled,recording:false,recordSupported:false})});
  bridge.play(packet(),0,1);assert.equal(requests.length,1);assert.equal(requests[0].text,'The door opens.\nA second moon waits.\nYou hear your own answer.\nWe carry the light home.');
  bridge.stop('user');assert.equal(requests[0].signal.aborted,true);requests[0].resolve(new Blob(['old audio']));await Promise.resolve();await Promise.resolve();
  assert.equal(played.length,0);assert.equal(voice.mouthLevel,0);assert.equal(timer.pending,0);bridge.dispose();
});

test('cue captions and actions preserve the actual audio speech lifetime across all four cuts',()=>{
  const stage=Object.create(Stage.prototype);Object.assign(stage,{time:0,character:new Face(),form:'face',onScene(){}});
  stage.character.speakingUntil=Infinity;
  const cues=buildSelectedPerformance(packet(),0,1).cues;
  for(let i=0;i<4;i++){
    stage.time=i*7;applyAfterimageCue(stage,cues[i]);
    assert.equal(stage.character.speakingUntil,Infinity);assert.equal(stage.caption,cues[i].speech);assert.equal(stage.captionUntil,i*7+7);assert.equal(stage.character.emotion,cues[i].emotion);
    assert.equal(stage.scene?.action??'none',cues[i].action);
  }
  stage.character.speakingUntil=stage.time;applyAfterimageCue(stage,cues[0]);assert.equal(stage.character.speakingUntil,stage.time);
});

for(const end of ['native stop','encoding error'])test(`${end} releases rehearsal ownership before a new manual recording begins`,()=>{
  const previous=globalThis.MediaRecorder,instances=[],timer=clock(),tracks=[],clips=[];let bridge;
  globalThis.MediaRecorder=class{
    static isTypeSupported(){return true;}
    constructor(){this.state='inactive';this.stops=0;instances.push(this);}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.stops++;}
  };
  try{
    const recorder=createRecorder({captureStream(){const track={stopped:false,stop(){this.stopped=true;}};tracks.push(track);return {getTracks:()=>[track]};}},(active,clip)=>{if(clip)clips.push(clip);bridge?.refreshState();});
    bridge=createAfterimageBridge(timer);bridge.connect({cue(){},speak(){},stop(){},startRecording:()=>recorder.start(),stopRecording:()=>recorder.stop(),getState:()=>({recording:recorder.active,recordSupported:recorder.supported,voiceEnabled:false})});
    bridge.recordAndPlay(packet(),0,0);timer.advance(7000);
    if(end==='native stop'){recorder.stop();instances[0].ondataavailable({data:new Blob(['early clip'])});instances[0].onstop();}
    else instances[0].onerror();
    assert.equal(recorder.active,false);assert.equal(tracks[0].stopped,true);
    recorder.start();timer.advance(21000);
    assert.equal(bridge.snapshot().status,'complete');assert.equal(instances[1].stops,0);assert.equal(recorder.active,true);assert.equal(tracks[1].stopped,false);
    recorder.stop();instances[1].ondataavailable({data:new Blob(['manual clip'])});instances[1].onstop();clips.forEach(clip=>URL.revokeObjectURL(clip.url));bridge.dispose();
  }finally{
    // Failed assertions still release recorder timers and tracks.
    for(const instance of instances)if(instance.onstop){instance.state='inactive';instance.onstop();}
    if(previous===undefined)delete globalThis.MediaRecorder;else globalThis.MediaRecorder=previous;
  }
});
