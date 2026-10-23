import test from 'node:test';
import assert from 'node:assert/strict';

import {createFloatingDynamics} from '../public/js/floating-dynamics.js';

const room={left:10,top:20,right:410,bottom:620,floor:540};
const tick=(motion,count=120)=>{for(let i=0;i<count;i++)motion.step(1/120);};

test('gravity off preserves manual placement and clamps only when the viewport shrinks',()=>{
  const motion=createFloatingDynamics({x:220,y:400,size:60});
  motion.setBounds(room);
  motion.keyboard(true);
  motion.setBounds({...room,floor:300});
  tick(motion);
  assert.equal(motion.state.x,220);
  assert.equal(motion.state.y,400);
  assert.equal(motion.state.vy,0);
  assert.equal(motion.state.hopCount,0);
  motion.setBounds({...room,right:260,bottom:420,floor:300});
  assert.equal(motion.state.x,200);
  assert.equal(motion.state.y,360);
});

test('gravity falls vertically and produces one landing squash that settles completely',()=>{
  const motion=createFloatingDynamics({x:220,y:180,size:60,gravity:true});
  motion.setBounds(room);
  motion.step(.05);
  assert.ok(motion.state.y>180);
  assert.ok(motion.state.vy>0);
  assert.equal(motion.state.x,220);
  for(let i=0;i<240&&!motion.state.grounded;i++)motion.step(1/120);
  assert.equal(motion.state.y,480);
  assert.equal(motion.state.vy,0);
  assert.equal(motion.state.grounded,true);
  assert.ok(motion.state.impact>0&&motion.state.impact<=1);
  tick(motion,300);
  assert.equal(motion.state.y,480);
  assert.equal(motion.state.impact,0);
});

test('turning gravity off stops a fall and turning it on resumes it',()=>{
  const motion=createFloatingDynamics({x:120,y:100,size:60,gravity:true});
  motion.setBounds(room);
  motion.step(.05);
  motion.setGravity(false);
  const {x,y}=motion.state;
  tick(motion);
  assert.equal(motion.state.x,x);
  assert.equal(motion.state.y,y);
  assert.equal(motion.state.vy,0);
  motion.setGravity(true);
  tick(motion);
  assert.equal(motion.state.y,480);
  assert.equal(motion.state.grounded,true);
});

test('opening the keyboard makes one 8px hop that follows its rising floor',()=>{
  const motion=createFloatingDynamics({x:220,y:480,size:60,gravity:true});
  motion.setBounds(room);
  motion.keyboard(true);
  assert.equal(motion.state.hopCount,1);
  assert.ok(motion.state.vy<0);
  motion.setBounds({...room,floor:340});
  assert.equal(motion.state.y,280);
  let apex=280;
  for(let i=0;i<60;i++){motion.step(1/240);apex=Math.min(apex,motion.state.y);}
  assert.ok(apex>=272&&apex<272.01,'the hop reaches 8px above its new floor');
  assert.equal(motion.state.y,280);
  assert.equal(motion.state.grounded,true);
  assert.equal(motion.state.x,220);
  motion.keyboard(true);
  motion.setBounds({...room,floor:332});
  tick(motion);
  assert.equal(motion.state.hopCount,1,'suggestion-height changes do not repeat the hop');
  assert.equal(motion.state.y,272);
  motion.keyboard(false);
  motion.setBounds(room);
  assert.equal(motion.state.y,272,'closing starts at the current position');
  assert.equal(motion.state.grounded,false);
  motion.step(.05);
  assert.ok(motion.state.y>272&&motion.state.y<480);
  tick(motion);
  assert.equal(motion.state.y,480);
  assert.equal(motion.state.hopCount,1);
  motion.keyboard(true);
  assert.equal(motion.state.hopCount,2,'a later opening can hop again');
});

test('opening the keyboard while falling never starts a hop',()=>{
  const motion=createFloatingDynamics({x:100,y:100,size:60,gravity:true});
  motion.setBounds(room);
  motion.keyboard(true);
  motion.step(.05);
  assert.ok(motion.state.y>100);
  assert.equal(motion.state.hopCount,0);
});

test('dragging preserves the pointer offset, clamps to the viewport, and never flings',()=>{
  const motion=createFloatingDynamics({x:100,y:180,size:60});
  motion.setBounds(room);
  assert.equal(motion.grab({x:110,y:195}),true);
  assert.equal(motion.drag({x:210,y:295}),true);
  assert.equal(motion.state.x,200);
  assert.equal(motion.state.y,280);
  tick(motion);
  assert.equal(motion.state.x,200);
  assert.equal(motion.state.y,280);
  motion.drag({x:1000,y:1000});
  assert.equal(motion.state.x,350);
  assert.equal(motion.state.y,560);
  motion.release();
  tick(motion);
  assert.equal(motion.state.dragging,false);
  assert.equal(motion.state.x,350);
  assert.equal(motion.state.y,560);
  assert.equal(motion.state.vy,0);
});

test('pointer cancellation releases gravity from rest without a hop or fling',()=>{
  const motion=createFloatingDynamics({x:100,y:480,size:60,gravity:true});
  motion.setBounds(room);
  motion.grab({x:110,y:490});
  motion.drag({x:210,y:210});
  motion.keyboard(true);
  motion.setBounds({...room,floor:340});
  assert.equal(motion.state.y,200,'floor movement does not carry a dragged body');
  motion.release({cancel:true});
  assert.equal(motion.state.dragging,false);
  assert.equal(motion.state.hopCount,0);
  assert.equal(motion.state.vy,0);
  motion.step(.05);
  assert.equal(motion.state.x,200);
  assert.ok(motion.state.y>200);
});

test('explicit placement interrupts dragging and stays fixed with gravity off',()=>{
  const motion=createFloatingDynamics({x:100,y:180,size:60});
  motion.setBounds(room);
  motion.grab({x:100,y:180});
  motion.place({x:80,y:240});
  assert.equal(motion.state.dragging,false);
  assert.equal(motion.drag({x:500,y:500}),false);
  tick(motion);
  assert.equal(motion.state.x,80);
  assert.equal(motion.state.y,240);
  assert.equal(motion.state.vy,0);
});

test('reduced motion settles immediately through keyboard changes and suppresses flourishes',()=>{
  const motion=createFloatingDynamics({x:120,y:160,size:60,gravity:true});
  motion.setBounds(room);
  motion.keyboard(false,{reduceMotion:true});
  assert.equal(motion.state.y,480);
  motion.keyboard(true,{reduceMotion:true});
  motion.setBounds({...room,floor:340});
  assert.equal(motion.state.y,280);
  assert.equal(motion.state.grounded,true);
  assert.equal(motion.state.hopCount,0);
  assert.equal(motion.state.impact,0);
  motion.keyboard(false,{reduceMotion:true});
  motion.setBounds(room);
  assert.equal(motion.state.y,480);
  assert.equal(motion.state.vy,0);
  motion.grab({x:120,y:480});
  motion.drag({x:150,y:200});
  assert.equal(motion.state.y,200,'reduced motion respects a held drag');
  motion.release({cancel:true});
  assert.equal(motion.state.y,480);
  assert.equal(motion.state.impact,0);
});

test('turning on reduced motion during a keyboard hop settles without a second hop',()=>{
  const motion=createFloatingDynamics({x:120,y:480,size:60,gravity:true});
  motion.setBounds(room);
  motion.keyboard(true);
  motion.step(.05);
  assert.ok(motion.state.y<480);
  motion.keyboard(true,{reduceMotion:true});
  assert.equal(motion.state.y,480);
  assert.equal(motion.state.vy,0);
  assert.equal(motion.state.hopCount,1);
  assert.equal(motion.state.impact,0);
});

test('a floor resize during the hop carries its current offset without restarting it',()=>{
  const motion=createFloatingDynamics({x:120,y:480,size:60,gravity:true});
  motion.setBounds(room);
  motion.keyboard(true);
  motion.setBounds({...room,floor:340});
  motion.step(.05);
  const before={y:motion.state.y,vy:motion.state.vy};
  motion.keyboard(true);
  motion.setBounds({...room,floor:330});
  assert.equal(motion.state.y,before.y-10);
  assert.equal(motion.state.vy,before.vy);
  assert.equal(motion.state.hopCount,1);
  tick(motion);
  assert.equal(motion.state.y,270);
  assert.equal(motion.state.grounded,true);
});

test('malformed pointers and bounds cannot corrupt placement',()=>{
  const motion=createFloatingDynamics({x:220,y:400,size:60});
  motion.setBounds(room);
  assert.equal(motion.grab({x:NaN,y:Infinity}),false);
  motion.place({x:Infinity,y:NaN});
  motion.setBounds({left:NaN,right:Infinity,top:-Infinity,bottom:NaN,floor:NaN});
  assert.equal(motion.state.x,220);
  assert.equal(motion.state.y,400);
  assert.equal(motion.state.dragging,false);
  motion.grab({x:220,y:400});
  assert.equal(motion.drag({x:NaN,y:0}),false);
  motion.release({cancel:true});
  motion.setGravity(true);
  motion.setBounds({left:210,right:10,top:320,bottom:20,floor:1000});
  assert.equal(motion.state.x,150);
  assert.equal(motion.state.y,260);
  motion.setBounds({left:0,right:30,top:0,bottom:40,floor:-10});
  assert.equal(motion.state.x,0);
  assert.equal(motion.state.y,0);
  assert.ok(Object.values(motion.state).filter(value=>typeof value==='number').every(Number.isFinite));
});

test('invalid or paused frame time cannot teleport a falling body',()=>{
  const motion=createFloatingDynamics({x:120,y:100,size:60,gravity:true});
  motion.setBounds(room);
  for(const elapsed of [NaN,Infinity,-1,undefined])motion.step(elapsed);
  assert.equal(motion.state.y,100);
  assert.equal(motion.state.vy,0);
  motion.step(3600);
  assert.ok(motion.state.y>100&&motion.state.y<110);
  assert.equal(motion.state.x,120);
});

test('resizing a grounded body preserves its bottom through shrink and growth',()=>{
  const motion=createFloatingDynamics({x:120,y:412,size:128,gravity:true});
  motion.setBounds(room);
  assert.equal(motion.state.grounded,true);
  assert.equal(motion.resize(96),motion.state);
  motion.setBounds(room);
  assert.equal(motion.state.y,444);
  assert.equal(motion.state.grounded,true);
  assert.equal(motion.state.vy,0);
  motion.resize(128);
  motion.setBounds(room);
  assert.equal(motion.state.y,412);
  assert.equal(motion.state.grounded,true);
  assert.equal(motion.state.x,120);
});

test('resizing a keyboard hop preserves its floor offset and velocity',()=>{
  const motion=createFloatingDynamics({x:120,y:412,size:128,gravity:true});
  motion.setBounds(room);
  motion.keyboard(true);
  motion.step(.05);
  const before={y:motion.state.y,vy:motion.state.vy};
  motion.resize(96);
  assert.equal(motion.state.y,before.y+32);
  assert.equal(motion.state.vy,before.vy);
  assert.equal(motion.state.grounded,false);
  motion.setBounds({...room,floor:340});
  assert.equal(motion.state.y,before.y-168);
  assert.equal(motion.state.vy,before.vy);
  assert.equal(motion.state.hopCount,1);
  tick(motion);
  assert.equal(motion.state.y,244);
  assert.equal(motion.state.grounded,true);
});

test('resizing with gravity off preserves placement except required viewport clamping',()=>{
  const motion=createFloatingDynamics({x:100,y:180,size:60});
  motion.setBounds(room);
  motion.resize(100);
  assert.equal(motion.state.x,100);
  assert.equal(motion.state.y,180);
  motion.place({x:310,y:520});
  motion.resize(128);
  assert.equal(motion.state.x,282);
  assert.equal(motion.state.y,492);
  assert.equal(motion.state.grounded,false);
  motion.resize(NaN);
  assert.equal(motion.state.size,128);
  assert.equal(motion.state.x,282);
  assert.equal(motion.state.y,492);
});

test('resizing mid-drag preserves the top-left position and pointer grip',()=>{
  const motion=createFloatingDynamics({x:100,y:180,size:60,gravity:true});
  motion.setBounds(room);
  motion.grab({x:110,y:195});
  motion.resize(100);
  assert.equal(motion.state.x,100);
  assert.equal(motion.state.y,180);
  assert.equal(motion.state.dragging,true);
  motion.drag({x:110,y:195});
  assert.equal(motion.state.x,100);
  assert.equal(motion.state.y,180);
  motion.drag({x:120,y:205});
  assert.equal(motion.state.x,110);
  assert.equal(motion.state.y,190);
});

test('resizing at a viewport edge adjusts the drag grip after unavoidable clamping',()=>{
  const motion=createFloatingDynamics({x:350,y:560,size:60});
  motion.setBounds(room);
  motion.grab({x:360,y:575});
  motion.resize(100);
  assert.equal(motion.state.x,310);
  assert.equal(motion.state.y,520);
  motion.drag({x:350,y:565});
  assert.equal(motion.state.x,300);
  assert.equal(motion.state.y,510);
});

test('a gravity landing rebounds once by at most 8px and then rests without drifting',()=>{
  const motion=createFloatingDynamics({x:120,y:100,size:60});
  motion.setBounds(room);motion.setGravity(true);
  assert.equal(motion.state.y,100,'enabling gravity starts at the actual placement');
  let contact=false,rebound=false,apex=480,arrivals=0,wasFalling=true;
  for(let frame=0;frame<480;frame++){
    motion.step(1/240);
    if(motion.state.y===480&&wasFalling){contact=true;arrivals++;}
    if(contact&&motion.state.y<480){rebound=true;apex=Math.min(apex,motion.state.y);}
    wasFalling=motion.state.vy>0;
  }
  assert.equal(contact,true);assert.equal(rebound,true,'a visible small bounce follows the first fall');
  assert.ok(apex>=472&&apex<=473);
  assert.equal(arrivals,2,'one first contact and one final settling contact');
  assert.equal(motion.state.y,480);assert.equal(motion.state.x,120);
  assert.equal(motion.state.grounded,true);assert.equal(motion.state.vy,0);
});
