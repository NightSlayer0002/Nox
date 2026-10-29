import test from 'node:test';
import assert from 'node:assert/strict';

let createVoiceCall;
const controllerUrl=new URL('../public/js/voice-call.js',import.meta.url);
try{({createVoiceCall}=await import(controllerUrl));}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND'||error.url!==controllerUrl.href)throw error;}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=async()=>{for(let index=0;index<6;index++)await Promise.resolve();};

function setup(options={}){
  assert.equal(typeof createVoiceCall,'function','The voice-call controller must be implemented.');
  const timers=new Map(),events=[],pending=deferred();let nextTimer=0;
  const call=createVoiceCall({supported:true,startListening:()=>events.push('listen'),stopListening:()=>events.push('stop-mic'),submit:text=>{events.push(['submit',text]);return pending.promise;},stopReply:()=>events.push('stop-reply'),setTimer:(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,delay});return id;},clearTimer:id=>timers.delete(id),...options});
  return {call,pending,events,timers,listens:()=>events.filter(event=>event==='listen').length,run(){assert.equal(timers.size,1,'exactly one microphone restart should be queued');const [id,timer]=timers.entries().next().value;assert.equal(timer.delay,200);timers.delete(id);timer.callback();}};
}
function listening(ui){ui.call.open();ui.call.connect();ui.call.onListening(true);}
function spoken(ui){ui.call.onVoiceState('preparing');ui.call.onVoiceState('speaking');ui.call.onVoiceEnd();}

test('a committed call answer survives an immediate audio failure without rearming recognition',async()=>{
  // Question: Is text already committed by the active call turn retained when audio fails before submit resolves?
  // Limits: Controller ownership and timer assertions, not actual storage, rendered modal or microphone hardware.
  let publishReply;const ui=setup({submit:(_text,{onReply})=>{publishReply=onReply;return new Promise(()=>{});}});listening(ui);ui.call.onTranscript('Current question');
  publishReply('A valid complete answer');ui.call.fail('Speech unavailable');await flush();
  assert.equal(ui.call.snapshot().reply,'A valid complete answer');assert.equal(ui.call.snapshot().status,'error');assert.equal(ui.timers.size,0);assert.equal(ui.listens(),1);
});

test('a stopped call turn cannot publish its answer into a reopened call',()=>{
  // Question: Does the committed-text callback retain the same ownership guard as the call operation?
  // Limits: Controlled stale callback, not all provider or native dialog event orderings.
  let publishReply;const ui=setup({submit:(_text,{onReply})=>{publishReply=onReply;return new Promise(()=>{});}});listening(ui);ui.call.onTranscript('Old question');ui.call.end();ui.call.open();
  publishReply('Obsolete answer');assert.equal(ui.call.snapshot().reply,'');assert.equal(ui.call.snapshot().active,false);
});

test('opening previews the call without asking for the microphone and snapshots are immutable',()=>{
  const ui=setup(),changes=[],unsubscribe=ui.call.subscribe(state=>changes.push(state));
  ui.call.open();
  assert.equal(ui.call.snapshot().open,true);assert.equal(ui.call.snapshot().active,false);
  assert.equal(ui.call.snapshot().status,'ready');assert.equal(ui.listens(),0);
  assert.ok(Object.isFrozen(ui.call.snapshot()));
  assert.ok(changes.some(state=>state.open));unsubscribe();const count=changes.length;
  ui.call.connect();assert.equal(changes.length,count);
});

test('unsupported calls stay explicit and a dynamic support check can recover after configuration',()=>{
  let supported=false;const ui=setup({supported:()=>supported});
  ui.call.open();assert.equal(ui.call.snapshot().status,'unsupported');
  assert.equal(ui.call.connect(),false);assert.equal(ui.listens(),0);
  supported=true;assert.equal(ui.call.connect(),true);assert.equal(ui.listens(),1);
  assert.equal(ui.call.snapshot().status,'connecting');
  const unsupported=setup({supported:false});unsupported.call.connect();assert.equal(unsupported.listens(),0);
});

test('one transcript is admitted while connecting or listening and the microphone stops before submission',async()=>{
  for(const started of [false,true]){
    const ui=setup();ui.call.open();ui.call.connect();if(started)ui.call.onListening(true);
    assert.equal(ui.call.connect(),false);assert.equal(ui.listens(),1);
    assert.equal(ui.call.onTranscript('  Help me understand this.  '),true);
    assert.equal(ui.call.snapshot().status,'thinking');
    assert.equal(ui.call.onTranscript('Duplicate result'),false);ui.call.onListening(false);await flush();
    assert.equal(ui.call.snapshot().status,'thinking');
    assert.equal(ui.call.snapshot().heard,'Help me understand this.');
    assert.equal(ui.events.filter(event=>Array.isArray(event)&&event[0]==='submit').length,1);
    const stop=ui.events.indexOf('stop-mic'),submit=ui.events.findIndex(event=>Array.isArray(event));
    assert.ok(stop>=0&&stop<submit);
  }
});

test('a completed response keeps the microphone paused until actual speech ends',async()=>{
  const ui=setup();listening(ui);ui.call.onTranscript('Hello');await flush();
  ui.pending.resolve({reply:'Hello there.',voicePending:true});await flush();
  assert.equal(ui.call.snapshot().reply,'Hello there.');assert.equal(ui.listens(),1);
  ui.call.onVoiceState('preparing');ui.call.onVoiceEnd();
  assert.equal(ui.timers.size,0,'preparation stop callbacks do not mean speech ended');
  ui.call.onVoiceState('ready');ui.call.onVoiceState('idle');assert.equal(ui.timers.size,0);
  ui.call.onVoiceState('speaking');assert.equal(ui.call.snapshot().status,'speaking');
  ui.call.onVoiceEnd();assert.equal(ui.listens(),1);ui.run();assert.equal(ui.listens(),2);
  assert.equal(ui.call.snapshot().status,'connecting');
});

test('speech ending before submit resolves waits for both events before rearming',async()=>{
  const ui=setup();listening(ui);ui.call.onTranscript('A short question');await flush();
  spoken(ui);assert.equal(ui.timers.size,0);assert.equal(ui.listens(),1);
  ui.pending.resolve({reply:'A complete reply.',voicePending:true});await flush();
  ui.call.onVoiceEnd();assert.equal(ui.timers.size,1);ui.run();assert.equal(ui.listens(),2);
});

test('voice.stop callbacks at submission start cannot prematurely restart recognition',async()=>{
  let ui;ui=setup({submit:async()=>{ui.call.onVoiceEnd();ui.call.onVoiceState('idle');return {reply:'Waiting for playback.',voicePending:true};}});
  listening(ui);ui.call.onTranscript('Question');await flush();
  assert.equal(ui.timers.size,0);assert.equal(ui.listens(),1);
  ui.call.onVoiceState('preparing');ui.call.onVoiceEnd();assert.equal(ui.timers.size,0);
  ui.call.onVoiceState('speaking');ui.call.onVoiceEnd();ui.run();assert.equal(ui.listens(),2);
});

test('blank, malformed, inactive and muted transcripts do not send requests',async()=>{
  const ui=setup();assert.equal(ui.call.onTranscript('Before connecting'),false);listening(ui);
  for(const text of ['', '  ',null,{},42])assert.equal(ui.call.onTranscript(text),false);
  ui.call.toggleMute();assert.equal(ui.call.onTranscript('Muted speech'),false);await flush();
  assert.equal(ui.events.filter(Array.isArray).length,0);assert.equal(ui.call.snapshot().status,'muted');
});

test('muting invalidates an outstanding response and unmuting deliberately rearms recognition',async()=>{
  const ui=setup();listening(ui);ui.call.onTranscript('Pending question');await flush();ui.call.toggleMute();
  assert.equal(ui.call.snapshot().muted,true);assert.equal(ui.call.snapshot().active,true);
  assert.ok(ui.events.includes('stop-reply'));ui.pending.resolve({reply:'Late reply',voicePending:true});await flush();
  ui.call.onVoiceState('speaking');ui.call.onVoiceEnd();assert.equal(ui.timers.size,0);
  assert.equal(ui.call.snapshot().reply,'');assert.equal(ui.call.snapshot().status,'muted');
  ui.call.toggleMute();assert.equal(ui.call.snapshot().muted,false);ui.run();assert.equal(ui.listens(),2);
});

test('mute cancels a queued microphone restart even if its old timer callback still runs',async()=>{
  const ui=setup();listening(ui);ui.call.onTranscript('Hello');await flush();
  ui.pending.resolve({reply:'Hi',voicePending:true});await flush();spoken(ui);
  const stale=ui.timers.values().next().value.callback;ui.call.toggleMute();assert.equal(ui.timers.size,0);
  stale();assert.equal(ui.listens(),1);assert.equal(ui.call.snapshot().status,'muted');
});

test('ending a call stops inputs and replies and ignores late response, microphone and voice callbacks',async()=>{
  const ui=setup();listening(ui);ui.call.onTranscript('Pending');await flush();ui.call.end();
  const ended=ui.call.snapshot();assert.equal(ended.open,false);assert.equal(ended.active,false);
  assert.equal(ui.events.at(-1),'stop-reply');assert.ok(ui.events.includes('stop-mic'));
  ui.pending.resolve({reply:'Should not appear',voicePending:true});await flush();
  ui.call.onListening(true);ui.call.onListening(false);ui.call.onVoiceState('speaking');ui.call.onVoiceEnd();
  assert.equal(ui.call.onTranscript('Late result'),false);
  assert.deepEqual(ui.call.snapshot(),ended);assert.equal(ui.listens(),1);assert.equal(ui.timers.size,0);
});

test('a restart queued by an ended call cannot affect a later call',async()=>{
  const ui=setup();listening(ui);ui.call.onTranscript('First call');await flush();
  ui.pending.resolve({reply:'First reply',voicePending:true});await flush();spoken(ui);
  const stale=ui.timers.values().next().value.callback;ui.call.end();ui.call.open();ui.call.connect();
  assert.equal(ui.listens(),2);stale();assert.equal(ui.listens(),2);
});

test('recognition errors pause without a loop and an explicit connect retries',()=>{
  const ui=setup();listening(ui);ui.call.fail('Microphone permission was denied.');
  assert.equal(ui.call.snapshot().status,'error');assert.match(ui.call.snapshot().error,/permission/);
  ui.call.onListening(false);ui.call.onVoiceEnd();assert.equal(ui.timers.size,0);assert.equal(ui.listens(),1);
  assert.equal(ui.call.connect(),true);assert.equal(ui.listens(),2);assert.equal(ui.call.snapshot().error,'');
});

test('synchronous and asynchronous microphone startup failures stay paused',async()=>{
  for(const startListening of [()=>{throw Error('Microphone blocked');},async()=>{throw Error('Microphone blocked');}]){
    const ui=setup({startListening});ui.call.connect();await flush();
    assert.equal(ui.call.snapshot().status,'error');assert.match(ui.call.snapshot().error,/blocked/);assert.equal(ui.timers.size,0);
  }
});

test('recognition ending without a result requires a manual resume',()=>{
  for(const started of [false,true]){
    const ui=setup();ui.call.connect();if(started)ui.call.onListening(true);ui.call.onListening(false);
    assert.equal(ui.call.snapshot().status,'paused');assert.equal(ui.timers.size,0);
    assert.equal(ui.call.connect(),true);assert.equal(ui.listens(),2);
  }
});

test('interrupt cancels the current reply and starts a new listening turn without accepting the old completion',async()=>{
  const ui=setup();listening(ui);ui.call.onTranscript('Old question');await flush();
  assert.equal(ui.call.interrupt(),true);assert.ok(ui.events.includes('stop-reply'));ui.run();
  assert.equal(ui.listens(),2);ui.pending.resolve({reply:'Old completion',voicePending:true});await flush();
  assert.equal(ui.call.snapshot().reply,'');assert.equal(ui.call.snapshot().status,'connecting');
});

test('a text-only response pauses honestly instead of pretending a spoken reply finished',async()=>{
  const ui=setup();listening(ui);ui.call.onTranscript('Question');await flush();
  ui.pending.resolve({reply:'Read this response.',voicePending:false});await flush();
  assert.equal(ui.call.snapshot().reply,'Read this response.');assert.equal(ui.call.snapshot().status,'paused');
  assert.equal(ui.timers.size,0);assert.equal(ui.listens(),1);assert.equal(ui.call.connect(),true);
});

test('a voice error after its end callback cancels the pending microphone restart',async()=>{
  const ui=setup();listening(ui);ui.call.onTranscript('Question');await flush();
  ui.pending.resolve({reply:'A reply',voicePending:true});await flush();spoken(ui);
  const stale=ui.timers.values().next().value.callback;ui.call.fail('Audio playback failed.');
  assert.equal(ui.timers.size,0);stale();assert.equal(ui.listens(),1);assert.equal(ui.call.snapshot().status,'error');
});

test('dispose stops the call, drops subscribers and makes all later controls inert',async()=>{
  const ui=setup(),changes=[];ui.call.subscribe(state=>changes.push(state));listening(ui);
  ui.call.onTranscript('Pending');await flush();ui.call.dispose();const count=changes.length;
  ui.pending.reject(Error('Late error'));await flush();ui.call.open();ui.call.connect();ui.call.toggleMute();ui.call.interrupt();ui.call.onListening(true);ui.call.onVoiceState('speaking');ui.call.onVoiceEnd();ui.call.fail('Late error');
  assert.equal(ui.call.snapshot().open,false);assert.equal(ui.call.snapshot().active,false);
  assert.equal(ui.listens(),1);assert.equal(ui.timers.size,0);assert.equal(changes.length,count);
});

test('other reply playback also pauses a connected microphone until its spoken cycle ends',()=>{
  for(const firstState of ['preparing','speaking']){
    const ui=setup();listening(ui);const stopped=ui.events.filter(event=>event==='stop-mic').length;
    ui.call.onVoiceState(firstState);
    assert.equal(ui.call.snapshot().status,firstState);
    assert.ok(ui.events.filter(event=>event==='stop-mic').length>stopped);
    ui.call.onListening(false);
    if(firstState==='preparing'){ui.call.onVoiceEnd();assert.equal(ui.timers.size,0);ui.call.onVoiceState('speaking');}
    ui.call.onVoiceEnd();ui.run();assert.equal(ui.listens(),2);
  }
});

test('reply failures pause visibly without an automatic microphone retry',async()=>{
  for(const submit of [async()=>{throw Error('The model connection failed.');},async()=>null]){
    const ui=setup({submit});listening(ui);ui.call.onTranscript('Question');await flush();
    assert.equal(ui.call.snapshot().status,'error');assert.ok(ui.call.snapshot().error);
    assert.equal(ui.listens(),1);assert.equal(ui.timers.size,0);
    assert.equal(ui.call.connect(),true);assert.equal(ui.listens(),2);
  }
});

test('an obsolete microphone start rejection cannot pause a newer call',async()=>{
  const started=deferred();let starts=0;
  const ui=setup({startListening:()=>{starts++;return starts===1?started.promise:undefined;}});
  ui.call.connect();ui.call.end();ui.call.connect();started.reject(Error('Late startup failure'));await flush();
  assert.equal(starts,2);assert.equal(ui.call.snapshot().status,'connecting');assert.equal(ui.call.snapshot().error,'');
});

test('ending from a state subscriber prevents any subsequent microphone start or request',async()=>{
  const connecting=setup();connecting.call.subscribe(state=>{if(state.status==='connecting')connecting.call.end();});
  connecting.call.connect();assert.equal(connecting.listens(),0);
  const thinking=setup();listening(thinking);thinking.call.subscribe(state=>{if(state.status==='thinking')thinking.call.end();});
  thinking.call.onTranscript('Cancelled before sending');await flush();
  assert.equal(thinking.events.filter(Array.isArray).length,0);
  const ending=setup();listening(ending);ending.call.onTranscript('A pending reply');await flush();
  let spoke=false;ending.call.subscribe(state=>{if(state.status==='speaking')spoke=true;else if(spoke&&state.status==='thinking')ending.call.end();});
  ending.call.onVoiceState('speaking');assert.doesNotThrow(()=>ending.call.onVoiceEnd());
  assert.equal(ending.call.snapshot().open,false);assert.equal(ending.timers.size,0);
});
