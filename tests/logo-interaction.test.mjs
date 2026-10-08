import test from 'node:test';
import assert from 'node:assert/strict';
import {createLogoGesture,createLogoReadiness} from '../public/js/logo-interaction.js';

test('emblem drag stays bounded and a second pointer cannot steal it',()=>{
  const gesture=createLogoGesture();assert.equal(gesture.begin(1,100,100),true);assert.equal(gesture.begin(2,100,100),false);
  assert.equal(gesture.move(2,10000,-10000),false);assert.deepEqual(gesture.angles,{x:0,y:0});
  gesture.move(1,10000,-10000);assert.equal(gesture.angles.x,-.45);assert.equal(gesture.angles.y,.9);
  assert.equal(gesture.end(2),false);assert.equal(gesture.active,true);assert.equal(gesture.end(1),true);
  assert.equal(gesture.move(1,0,0),false);
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
test('keyboard turns use the same bounds without interrupting an active pointer',()=>{
  const gesture=createLogoGesture();for(let i=0;i<20;i++)gesture.turn(.15);assert.equal(gesture.angles.y,.9);
  gesture.begin(1,0,0);assert.equal(gesture.turn(-.2),false);gesture.end(1);gesture.turn(-.2);assert.ok(Math.abs(gesture.angles.y-.7)<1e-9);
});
