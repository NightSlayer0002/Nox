import test from 'node:test';
import assert from 'node:assert/strict';
import {createCinematicLoop,attachCinematicHandoff} from '../public/js/cinematic-presence.js';

function frameClock(){
  let next=0;const pending=new Map();
  return {request:callback=>{pending.set(++next,callback);return next;},cancel:id=>pending.delete(id),get size(){return pending.size;},step(time){const callbacks=[...pending.values()];pending.clear();for(const callback of callbacks)callback(time);}};
}

test('the cinematic renderer owns no frames offscreen or in a hidden tab and excludes hidden time',()=>{
  const clock=frameClock(),frames=[],presence=[];
  const loop=createCinematicLoop({...clock,request:clock.request,cancel:clock.cancel,render:frame=>frames.push(frame),presence:active=>presence.push(active),fps:30});
  assert.equal(clock.size,0);
  loop.setVisible(true);clock.step(100);clock.step(140);
  assert.equal(frames.length,2);assert.ok(frames[1].elapsed<.05);
  loop.setPageVisible(false);assert.equal(clock.size,0);clock.step(10000);
  loop.setPageVisible(true);clock.step(10040);
  assert.equal(frames.length,3);assert.ok(frames[2].elapsed<.05);
  loop.setVisible(false);assert.equal(clock.size,0);
  assert.deepEqual(presence,[true,false,true,false]);
  loop.dispose();loop.setVisible(true);assert.equal(clock.size,0);
});

test('pausing freezes drift while the live portrait can continue and resuming has no time jump',()=>{
  const clock=frameClock(),frames=[];
  const loop=createCinematicLoop({request:clock.request,cancel:clock.cancel,render:frame=>frames.push(frame),fps:30});
  loop.setVisible(true);clock.step(0);clock.step(40);
  loop.setMotion(false);clock.step(80);clock.step(120);
  assert.equal(frames[1].elapsed,frames[3].elapsed);assert.equal(frames[3].dt,0);
  loop.setMotion(true);clock.step(160);
  assert.ok(frames[4].elapsed-frames[3].elapsed<=.05);
  loop.dispose();assert.equal(clock.size,0);
});

test('disposing a visible scene releases the character exactly once and cancels its pending render',()=>{
  const clock=frameClock(),presence=[];
  const loop=createCinematicLoop({request:clock.request,cancel:clock.cancel,render(){},presence:active=>presence.push(active)});
  loop.setVisible(true);loop.dispose();loop.dispose();
  assert.deepEqual(presence,[true,false]);assert.equal(clock.size,0);
});

test('the cinematic handoff draws the same Stage and suppresses the corner until it is released',()=>{
  let before=0;
  const host={hidden:false},stage={time:0,canvas:{dataset:{}},character:{x:.5,y:.5},onBeforeFrame(){before++;this.characterAlpha=0;this.renderEnabled=false;host.hidden=false;this.canvas.dataset.presence='peeking';}};
  const original=stage.onBeforeFrame,handoff=attachCinematicHandoff(stage,host);
  handoff.setActive(true);stage.onBeforeFrame(0,1/60);
  assert.equal(before,1);assert.equal(host.hidden,true);assert.equal(stage.renderEnabled,true);assert.equal(stage.characterAlpha,1);
  assert.equal(stage.canvas.dataset.presence,'cinematic');assert.equal(stage.character.x,.5);
  handoff.setPointer({x:99,y:-99});stage.onBeforeFrame(0,1/60);
  assert.ok(stage.pointer.x<=1&&stage.pointer.y>=0);assert.equal(stage.character.x,.5);
  handoff.setActive(false);
  assert.equal(host.hidden,false);assert.equal(stage.canvas.dataset.presence,'peeking');assert.equal(stage.renderEnabled,false);
  handoff.dispose();assert.equal(stage.onBeforeFrame,original);
});

test('disposing a handoff also restores a Stage without a corner controller',()=>{
  const pointer={x:.2,y:.3},host={hidden:true};
  const stage={time:0,pointer,renderEnabled:false,characterAlpha:.4,canvas:{dataset:{presence:'room'}},character:{x:.5,y:.5}};
  const handoff=attachCinematicHandoff(stage,host);
  handoff.setActive(true);handoff.setPointer({x:1,y:1});stage.onBeforeFrame();handoff.dispose();
  assert.equal(stage.pointer,pointer);assert.equal(stage.renderEnabled,false);assert.equal(stage.characterAlpha,.4);
  assert.equal(stage.canvas.dataset.presence,'room');assert.equal(host.hidden,true);
});
