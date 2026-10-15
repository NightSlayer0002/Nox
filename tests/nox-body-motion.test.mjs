import test from 'node:test';
import assert from 'node:assert/strict';
import {createBodyMotion} from '../client/nox-body-motion.js';

const face=(values={})=>({x:.5,y:.46,held:false,impactAt:-100,impactStrength:0,reduceMotion:false,...values});
const bounded=weights=>{for(const value of Object.values(weights))assert.ok(Number.isFinite(value)&&value>=0&&value<=1);};

test('held metal eases into a small stretch and returns to rest after release',()=>{
  const motion=createBodyMotion(),state=face();
  motion.sample(state,0);state.held=true;
  const first=motion.sample(state,.02);assert.ok(first.Hold>0&&first.Hold<.2);
  for(let time=.04;time<.8;time+=.02)motion.sample(state,time);
  assert.ok(motion.sample(state,.8).Hold>.6);
  state.held=false;
  for(let time=.82;time<2;time+=.02)motion.sample(state,time);
  assert.ok(motion.sample(state,2).Hold<.001);
});

test('a quick held pull produces a directional damped wobble that settles without changing the face',()=>{
  const motion=createBodyMotion(),state=face({held:true,speakingUntil:Infinity,emotion:'curious'});
  motion.sample(state,0);state.x=.55;motion.sample(state,.04);state.x=.61;motion.sample(state,.08);
  state.held=false;const released=motion.sample(state,.1);
  assert.ok(released.WobbleRight>0);assert.equal(released.WobbleLeft,0);
  let sawOpposite=false;
  for(let time=.12;time<2;time+=.02){const weights=motion.sample(state,time);bounded(weights);if(weights.WobbleLeft>0)sawOpposite=true;}
  assert.ok(sawOpposite,'the body returns through its neutral shape');
  assert.ok(motion.sample(state,2).WobbleRight<.001);
  assert.equal(state.speakingUntil,Infinity);assert.equal(state.emotion,'curious');
});

test('ordinary idle motion does not masquerade as a throw and impact only adds local bulge',()=>{
  const motion=createBodyMotion(),state=face();motion.sample(state,0);
  state.x=.8;assert.equal(motion.sample(state,.04).WobbleRight,0);
  state.impactAt=.05;state.impactStrength=.8;
  const weight=motion.sample(state,.15);assert.ok(weight.Impact>0&&weight.Impact<.8);
  assert.equal(weight.Hold,0);assert.equal(motion.sample(state,.6).Impact,0);
});

test('a slow GPU frame keeps an actively held stretch while suppressing stale release impulses',()=>{
  const motion=createBodyMotion(),state=face({held:true});motion.sample(state,0);
  for(let time=.02;time<=.2;time+=.02)motion.sample(state,time);
  const before=motion.sample(state,.22).Hold;
  state.x=.9;const after=motion.sample(state,.8);
  assert.ok(after.Hold>=before,'a real held pose must not reset every slow frame');
  state.held=false;const released=motion.sample(state,.84);
  assert.equal(released.WobbleLeft,0);assert.equal(released.WobbleRight,0);
});

test('reduced motion, invalid values, background gaps and reversed clocks cannot create runaway deformation',()=>{
  const motion=createBodyMotion(),state=face({held:true});motion.sample(state,0);state.x=.7;motion.sample(state,.04);
  state.reduceMotion=true;assert.deepEqual(motion.sample(state,.08),{Hold:0,WobbleLeft:0,WobbleRight:0,Impact:0});
  state.reduceMotion=false;state.held=false;bounded(motion.sample(state,100));
  assert.equal(motion.sample(state,100.04).WobbleRight,0);
  for(const time of [NaN,Infinity,-1,-2,0,.01,.01])bounded(motion.sample({...state,x:NaN,y:Infinity,impactAt:NaN,impactStrength:Infinity},time));
});
