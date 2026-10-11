import test from 'node:test';
import assert from 'node:assert/strict';
import {createLogoGesture,createLogoReadiness,emblemFeatures,releaseLogoInteraction} from '../public/js/logo-interaction.js';

test('emblem drag stays bounded and a second pointer cannot steal it',()=>{
  const gesture=createLogoGesture();assert.equal(gesture.begin(1,100,100),true);assert.equal(gesture.begin(2,100,100),false);
  assert.equal(gesture.move(2,10000,-10000),false);assert.deepEqual(gesture.angles,{x:0,y:0});
  gesture.move(1,10000,-10000);assert.equal(gesture.angles.x,-.45);assert.equal(gesture.angles.y,.9);
  assert.equal(gesture.end(2),false);assert.equal(gesture.active,true);assert.equal(gesture.end(1),true);
  assert.equal(gesture.move(1,0,0),false);
});
test('the hero face blinks and a greeting squeezes its eyes, then restores its proportions',()=>{
  const idle=emblemFeatures(1),greeting=emblemFeatures(1.3,1),settled=emblemFeatures(2,1);
  assert.equal(idle.eyes,1);assert.ok(greeting.eyes<.45);assert.ok(greeting.smile>1);
  assert.equal(settled.eyes,1);assert.equal(settled.smile,1);
  assert.ok(emblemFeatures(6.06).eyes<.3);
  for(let t=0;t<30;t+=.013){const face=emblemFeatures(t,10);assert.ok(face.eyes>=.06&&face.eyes<=1);assert.ok(Number.isFinite(face.smile));}
});

test('async icon and metal readiness cannot remove the fallback during primary context loss',()=>{
  const statuses=[],state=createLogoReadiness(status=>statuses.push(status));
  state.lose();state.setPhase('solid');state.setPhase('metal');
  assert.equal(state.status,'fallback');assert.deepEqual(statuses,['fallback']);
  state.restore();assert.equal(state.status,'metal');assert.deepEqual(statuses,['fallback','metal']);
});
test('restoring before the icon exists stays loading, while a failed asset keeps its fallback',()=>{
  const state=createLogoReadiness(()=>{});state.lose();state.restore();assert.equal(state.status,'loading');
  state.setPhase('fallback');state.lose();state.restore();assert.equal(state.status,'fallback');
  assert.equal(state.setPhase('unexpected'),false);assert.equal(state.status,'fallback');
});
test('invalid coordinates cannot corrupt the emblem and reset releases a held drag',()=>{
  const gesture=createLogoGesture();assert.equal(gesture.begin(1,NaN,100),false);gesture.begin(1,0,0);
  assert.equal(gesture.move(1,Infinity,0),false);assert.deepEqual(gesture.angles,{x:0,y:0});gesture.move(1,80,40);gesture.reset();
  assert.equal(gesture.active,false);assert.deepEqual(gesture.angles,{x:0,y:0});assert.equal(gesture.begin(2,0,0),true);
});
test('context fallback releases captured ownership even if the removed target cannot release capture',()=>{
  const gesture=createLogoGesture();gesture.begin(1,0,0);gesture.move(1,100,40);let centered=0;
  releaseLogoInteraction(gesture,{hasPointerCapture:()=>true,releasePointerCapture:()=>{throw Error('Detached target');}},1,()=>centered++);
  assert.equal(gesture.active,false);assert.deepEqual(gesture.angles,{x:0,y:0});assert.equal(centered,1);
  assert.equal(gesture.begin(2,20,20),true);gesture.end(2);assert.equal(gesture.turn(.1),true);
});
test('keyboard turns use the same bounds without interrupting an active pointer',()=>{
  const gesture=createLogoGesture();for(let i=0;i<20;i++)gesture.turn(.15);assert.equal(gesture.angles.y,.9);
  gesture.begin(1,0,0);assert.equal(gesture.turn(-.2),false);gesture.end(1);gesture.turn(-.2);assert.ok(Math.abs(gesture.angles.y-.7)<1e-9);
});
