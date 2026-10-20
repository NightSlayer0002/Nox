import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmblemFireflies} from '../public/js/emblem-fireflies.js';

const pose={screenX:.75,screenY:.5,size:.34,opacity:1,spread:0};
const frame={pose,width:10,height:6,time:0,delta:1/60};

test('the swarm trails a crossing face, then catches up when scrolling stops or reverses',()=>{
  const swarm=createEmblemFireflies();
  assert.equal(swarm.update(frame).center.x,2.5);
  const left={...pose,screenX:.25};
  const first=swarm.update({...frame,pose:left,time:1});
  assert.ok(first.center.x<2.5&&first.center.x>-2.5,'follow without teleporting');
  for(let i=0;i<180;i++)swarm.update({...frame,pose:left,time:1+i/60});
  assert.ok(Math.abs(swarm.update({...frame,pose:left}).center.x+2.5)<.001);
  const returning=swarm.update(frame);
  assert.ok(returning.center.x>-2.5&&returning.center.x<2.5,'reverse without overshooting');
});

test('reduced motion keeps the fireflies still while tracking the current face and its fade',()=>{
  const swarm=createEmblemFireflies();
  const still=swarm.update({...frame,reduceMotion:true});
  const points=[...still.positions],glows=[...still.glows];
  const later=swarm.update({...frame,time:100,reduceMotion:true});
  assert.deepEqual([...later.positions],points);
  assert.deepEqual([...later.glows],glows);
  const moved=swarm.update({...frame,pose:{...pose,screenX:.25,opacity:.2},reduceMotion:true});
  assert.equal(moved.center.x,-2.5);
  assert.equal(moved.opacity,.2);
});

test('fireflies wander at rest and resume near NOX after a suspended frame',()=>{
  const swarm=createEmblemFireflies(),before=[...swarm.update(frame).positions];
  assert.notDeepEqual([...swarm.update({...frame,time:2}).positions],before);
  const restored=swarm.update({...frame,pose:{...pose,screenX:.25},time:300,delta:298});
  assert.equal(restored.center.x,-2.5,'a returning tab does not replay a long chase');
  assert.ok([...restored.positions,...restored.glows].every(Number.isFinite));
});

test('the swarm stays near the face when the eyes and smile separate during a crossing',()=>{
  const swarm=createEmblemFireflies();
  for(let time=0;time<20;time+=.5){
    const {positions}=swarm.update({...frame,time,pose:{...pose,spread:2}});
    for(let i=0;i<positions.length;i+=3){
      assert.ok(Math.abs(positions[i])<3.2,'lights should not scatter across the copy');
      assert.ok(Math.abs(positions[i+1])<3.2,'the smile keeps its nearby lights');
    }
  }
});

test('a viewport change places the swarm with the newly sized face immediately',()=>{
  const swarm=createEmblemFireflies();
  swarm.update(frame);
  const resized=swarm.update({...frame,width:4,height:8,pose:{...pose,screenX:.25,screenY:.75}});
  assert.equal(resized.center.x,-1);
  assert.equal(resized.center.y,-2);
});
