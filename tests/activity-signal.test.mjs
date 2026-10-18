import test from 'node:test';
import assert from 'node:assert/strict';
import {createActivitySignal} from '../public/js/activity-signal.js';

test('the activity signal reports the actual reply and voice lifecycle with elapsed event times',()=>{
  let time=1000;const updates=[],signal=createActivitySignal({now:()=>time,onChange:snapshot=>updates.push(snapshot)});
  assert.deepEqual(signal.snapshot(),{state:'idle',label:'Idle',events:[{state:'idle',label:'Idle',time:0}]});
  time=1100;const token=signal.beginTurn();
  time=1250;signal.transition('reply-ready',token);
  time=1300;signal.transition('preparing',token);
  time=1400;signal.transition('speaking',token);
  time=2000;assert.equal(signal.finishTurn(token),true);
  assert.deepEqual(updates.map(item=>item.state),['thinking','reply-ready','preparing','speaking','idle']);
  assert.deepEqual(signal.snapshot().events.map(event=>event.time),[0,100,250,300,400,1000]);
  assert.equal(signal.snapshot().state,'idle');
});

test('late work from an old turn cannot replace the current turn or add stale history',()=>{
  const signal=createActivitySignal({now:()=>0});
  const old=signal.beginTurn(),current=signal.beginTurn();
  signal.transition('reply-ready',current);const before=signal.snapshot();
  assert.equal(signal.transition('speaking',old),false);
  assert.equal(signal.finishTurn(old,'error'),false);
  assert.deepEqual(signal.snapshot(),before);
  assert.equal(signal.transition('preparing',current),true);
  assert.equal(signal.finishTurn(current),true);
  assert.equal(signal.transition('error',current),false);
  assert.equal(signal.finishTurn(current),false);
  assert.equal(signal.snapshot().state,'idle');
});

test('a failed turn keeps its error state while invalidating later callbacks',()=>{
  const signal=createActivitySignal(),token=signal.beginTurn();
  assert.equal(signal.finishTurn(token,'error'),true);
  assert.equal(signal.snapshot().state,'error');
  assert.equal(signal.transition('speaking',token),false);
  signal.transition('listening');assert.equal(signal.snapshot().label,'Listening');
});

test('repeated frame updates do not flood the last six real activity events',()=>{
  let time=0;const updates=[],signal=createActivitySignal({now:()=>time,onChange:value=>updates.push(value)});
  for(const state of ['listening','thinking','reply-ready','preparing','speaking','idle','listening','thinking']) {
    time+=10;signal.transition(state);signal.transition(state);
  }
  assert.equal(updates.length,8);
  assert.deepEqual(signal.snapshot().events.map(event=>event.state),['reply-ready','preparing','speaking','idle','listening','thinking']);
  assert.equal(signal.snapshot().events[0].time,30);
});

test('snapshots contain only fixed public states and labels, never caller payloads',()=>{
  const signal=createActivitySignal({now:()=>10}),token=signal.beginTurn();
  signal.transition('reply-ready',token,{prompt:'PRIVATE PROMPT',text:'PRIVATE REPLY',provider:'PRIVATE PROVIDER'});
  assert.throws(()=>signal.transition({state:'thinking',text:'PRIVATE TEXT'}),/activity state/i);
  assert.throws(()=>signal.transition('__proto__'),/activity state/i);
  const snapshot=signal.snapshot();
  assert.deepEqual(Object.keys(snapshot).sort(),['events','label','state']);
  for(const event of snapshot.events)assert.deepEqual(Object.keys(event).sort(),['label','state','time']);
  assert.doesNotMatch(JSON.stringify(snapshot),/PRIVATE/);
  assert.throws(()=>snapshot.events.push({state:'fake'}),TypeError);
  assert.throws(()=>{snapshot.events[0].label='Changed';},TypeError);
  assert.equal(signal.snapshot().events[0].label,'Idle');
});

test('event timestamps stay nonnegative and ordered if the injected clock moves backwards',()=>{
  let time=100;const signal=createActivitySignal({now:()=>time});
  time=90;signal.transition('listening');time=120;signal.transition('thinking');
  time=NaN;signal.transition('reply-ready');time=110;signal.transition('preparing');
  assert.deepEqual(signal.snapshot().events.map(event=>event.time),[0,0,20,20,20]);
});

test('a readout callback failure cannot interrupt the conversation pipeline',()=>{
  const signal=createActivitySignal({onChange(){throw Error('Readout unavailable');}});
  assert.doesNotThrow(()=>signal.beginTurn());
  assert.equal(signal.snapshot().state,'thinking');
});
