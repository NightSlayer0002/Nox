import test from 'node:test';
import assert from 'node:assert/strict';
const activityModule=await import('../public/js/brain-activity.js').catch(()=>null);
const create=()=>{assert.ok(activityModule,'brain interaction controller must exist');return new activityModule.BrainActivity();};
const advance=(activity,seconds,state={status:'idle'})=>{let frame;for(let i=0;i<seconds/.02;i++)frame=activity.step(.02,state);return frame;};
test('click impulses are bounded, expire, and cannot accumulate under rapid input',()=>{
  const activity=create();
  for(let i=0;i<1000;i++)activity.emit('poke',[99,-99,NaN],99);
  const frame=activity.step(.01,{status:'idle'});
  assert.ok(frame.waves.length<=8&&frame.waves.length>0);
  assert.ok(frame.waves.every(w=>w.origin.every(Number.isFinite)&&w.origin.every(v=>Math.abs(v)<=.8)&&w.strength<=1));
  advance(activity,3);
  assert.equal(activity.waves.filter(w=>w.kind==='poke').length,0);
});
test('speaking waves follow audible syllables and settle during silence',()=>{
  const activity=create();
  let frame=activity.step(.02,{status:'speaking',audioLevel:.7});
  assert.ok(frame.waves.some(w=>w.kind==='speech'));assert.ok(frame.drive>.5);
  const initial=activity.serial;
  frame=advance(activity,1,{status:'speaking',audioLevel:0});
  assert.equal(activity.serial,initial);assert.ok(frame.drive<.05);
  advance(activity,.3,{status:'speaking',audioLevel:.8});assert.ok(activity.serial>initial);
});
test('thinking recruits repeated regions while idle uses a slower cadence',()=>{
  const thought=create(),idle=create();advance(thought,3,{status:'thinking'});advance(idle,3,{status:'idle'});
  assert.ok(thought.serial>idle.serial);
  assert.ok(new Set(thought.waves.map(w=>w.origin.join(','))).size>1);
});
test('motion freeze and a background gap cannot jump or exhaust the wave controller',()=>{
  const activity=create();activity.emit('poke',[0,0,0],1);
  const before=activity.step(.02,{status:'idle'});
  const frozen=activity.step(100,{status:'thinking',reduceMotion:true});
  assert.equal(before.waveTime,frozen.waveTime);assert.equal(activity.serial,1);
  const after=activity.step(100,{status:'thinking'});
  assert.ok(after.waveTime-before.waveTime<=.051);
  assert.ok(Number.isFinite(after.drive));
  activity.clear();assert.equal(activity.waves.length,0);
});
