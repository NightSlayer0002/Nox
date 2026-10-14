import test from 'node:test';
import assert from 'node:assert/strict';
import {createCinematicDynamics} from '../public/js/cinematic-dynamics.js';

const bounds={left:-5,right:5,bottom:-3,top:3};
const speed=state=>Math.hypot(state.vx,state.vy);

test('a free character drifts without gravity and gradually loses speed',()=>{
  const motion=createCinematicDynamics({x:0,y:0,vx:1,vy:.4,bounds});
  for(let i=0;i<20;i++)motion.step(.05);
  assert.ok(motion.state.x>.85&&motion.state.x<1);
  assert.ok(motion.state.y>.34&&motion.state.y<.4);
  assert.ok(motion.state.vy>0);
  assert.ok(speed(motion.state)<Math.hypot(1,.4));
});

test('grabbing preserves the pointer offset and holds the character within visible bounds',()=>{
  const motion=createCinematicDynamics({x:1,y:1,bounds});
  motion.grab({x:1.3,y:1.2},0);
  motion.drag({x:2.3,y:2.2},40);
  assert.ok(Math.abs(motion.state.x-2)<1e-10);
  assert.ok(Math.abs(motion.state.y-2)<1e-10);
  motion.step(.05);
  assert.ok(Math.abs(motion.state.x-2)<1e-10);
  motion.drag({x:100,y:-100},70);
  assert.equal(motion.state.x,5);assert.equal(motion.state.y,-3);
  assert.equal(motion.state.dragging,true);
});

test('a fast diagonal throw preserves its direction but caps its total speed',()=>{
  const motion=createCinematicDynamics({x:0,y:0,vx:0,vy:0,bounds,maxSpeed:2.2});
  motion.grab({x:0,y:0},100);
  motion.drag({x:1,y:1},140);
  motion.release(145);
  assert.equal(motion.state.dragging,false);
  assert.ok(Math.abs(speed(motion.state)-2.2)<1e-9);
  assert.ok(motion.state.vx>0&&motion.state.vy>0);
  motion.step(.05);
  assert.ok(motion.state.x>1&&motion.state.y>1);
  assert.ok(speed(motion.state)<=2.2);
});

test('walls return a damped bounce instead of letting the portrait leave the room',()=>{
  const motion=createCinematicDynamics({x:4.99,y:2.99,vx:1,vy:1,bounds});
  motion.step(.05);
  assert.ok(motion.state.x<=5&&motion.state.y<=3);
  assert.ok(motion.state.vx<0&&motion.state.vy<0);
  assert.ok(speed(motion.state)<1.3);
  const {x,y}=motion.state;motion.step(.05);
  assert.ok(motion.state.x<x&&motion.state.y<y);
});

test('pointer cancellation releases without a throw',()=>{
  const motion=createCinematicDynamics({bounds});
  motion.grab({x:0,y:0},0);motion.drag({x:2,y:1},40);
  motion.release(45,{cancel:true});
  const {x,y}=motion.state;motion.step(.05);
  assert.equal(motion.state.x,x);assert.equal(motion.state.y,y);
  assert.equal(speed(motion.state),0);assert.equal(motion.state.dragging,false);
});

test('duplicate timestamps and releases after a hold do not create a fling',()=>{
  for(const variant of ['duplicate','held','backwards','missing']){
    const motion=createCinematicDynamics({bounds});
    motion.grab({x:0,y:0},100);
    motion.drag({x:1,y:1},variant==='duplicate'?100:140);
    motion.release(variant==='held'?400:variant==='backwards'?120:variant==='missing'?NaN:145);
    assert.equal(speed(motion.state),0,variant);
  }
});

test('a sparse pointer jump needs fresh samples before it can be thrown',()=>{
  const motion=createCinematicDynamics({bounds});
  motion.grab({x:0,y:0},0);motion.drag({x:2,y:1},400);
  motion.release(405);assert.equal(speed(motion.state),0);
  motion.grab({x:2,y:1},500);motion.drag({x:2.1,y:1},540);motion.release(545);
  assert.ok(motion.state.vx>0);assert.equal(motion.state.vy,0);
  assert.ok(speed(motion.state)<=2.2);
});

test('unbounded or invalid frame time cannot produce a reentry jump',()=>{
  const motion=createCinematicDynamics({x:0,y:0,vx:1,vy:0,bounds});
  for(const dt of [NaN,Infinity,-1,undefined])motion.step(dt);
  assert.equal(motion.state.x,0);
  motion.step(3600);
  assert.ok(motion.state.x>0&&motion.state.x<=.05);
  assert.equal(motion.state.y,0);
});

test('resizing clamps the visible position and sanitizes malformed bounds and pointers',()=>{
  const motion=createCinematicDynamics({x:4,y:2,bounds});
  motion.setBounds({left:-1,right:1,bottom:-.5,top:.5});
  assert.equal(motion.state.x,1);assert.equal(motion.state.y,.5);
  motion.grab({x:Infinity,y:NaN},0);motion.drag({x:NaN,y:Infinity},10);
  assert.equal(motion.state.dragging,false);
  motion.setBounds({left:NaN,right:Infinity,bottom:.5,top:-.5});
  motion.step(.05);
  assert.ok(Object.values(motion.state).filter(v=>typeof v==='number').every(Number.isFinite));
  assert.ok(motion.state.x<=1&&motion.state.y<=.5&&motion.state.y>=-.5);
});
