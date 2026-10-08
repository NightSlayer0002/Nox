import test from 'node:test';
import assert from 'node:assert/strict';
import { createPeekState, cursorForFace, attachPeek } from '../public/js/peek.js';

test('NOX peeks only after leaving the room, and returns without flickering near the boundary',()=>{
  const peek=createPeekState();
  assert.equal(peek.update({originalBottom:300,scrollTop:0,dt:1/60}).progress,0);
  for(let i=0;i<50;i++)peek.update({originalBottom:-20,scrollTop:700,dt:1/60});
  assert.equal(peek.docked,true);assert.ok(peek.progress>.99);
  peek.update({originalBottom:20,scrollTop:650,dt:1/60});assert.equal(peek.docked,true);
  for(let i=0;i<50;i++)peek.update({originalBottom:100,scrollTop:500,dt:1/60});
  assert.equal(peek.docked,false);assert.equal(peek.progress,0);
});

test('peeking composes with the landing callbacks and releases owned pointer listeners',()=>{
  const names=['document','innerWidth','innerHeight','scrollY'],previous=Object.fromEntries(names.map(name=>[name,globalThis[name]]));
  Object.assign(globalThis,{document:new EventTarget(),innerWidth:1280,innerHeight:800,scrollY:0});
  let before=0,after=0;
  const stage={canvas:{dataset:{},getBoundingClientRect:()=>({left:800,top:200,width:240,height:280,bottom:480})},character:{x:.5,y:.5,unit:()=>1},events:new AbortController(),onBeforeFrame:()=>before++,onAfterFrame:()=>after++};
  const host=Object.assign(new EventTarget(),{dataset:{}}),canvas={getContext:()=>({})};
  try{
    attachPeek(stage,host,canvas);stage.onBeforeFrame(0,1/60);stage.onAfterFrame();
    assert.equal(before,1);assert.equal(after,1);
    const move=new Event('pointermove');Object.assign(move,{clientX:100,clientY:100});document.dispatchEvent(move);stage.onBeforeFrame(0,1/60);const pointer={...stage.pointer};
    stage.events.abort();const ignored=new Event('pointermove');Object.assign(ignored,{clientX:900,clientY:700});document.dispatchEvent(ignored);stage.onBeforeFrame(0,1/60);
    assert.deepEqual(stage.pointer,pointer);
  }finally{stage.events.abort();for(const name of names){if(previous[name]===undefined)delete globalThis[name];else globalThis[name]=previous[name];}}
});

test('a restored scroll position docks immediately with motion off, then returning to top restores NOX',()=>{
  const peek=createPeekState();
  assert.equal(peek.update({originalBottom:-40,scrollTop:800,dt:0,reduceMotion:true}).progress,1);
  assert.equal(peek.update({originalBottom:500,scrollTop:0,dt:0,reduceMotion:true}).progress,0);
});

test('corner gaze points at the real cursor without moving NOX out of his original room position',()=>{
  const home={x:.76,y:.65};
  const left=cursorForFace({x:0,y:100},{x:1200,y:650},home);
  const right=cursorForFace({x:1270,y:700},{x:1200,y:650},home);
  assert.ok(left.x<home.x);assert.ok(left.y<home.y);assert.ok(right.x>home.x);assert.ok(right.y>home.y);
  assert.deepEqual(home,{x:.76,y:.65});
});

test('moving outside the offscreen hero wakes the peeker through its actual corner coordinates',()=>{
  const names=['document','innerWidth','innerHeight','scrollY'],previous=Object.fromEntries(names.map(name=>[name,globalThis[name]]));
  Object.assign(globalThis,{document:new EventTarget(),innerWidth:1280,innerHeight:800,scrollY:1000});
  const noticed=[];
  const stage={time:5,canvas:{dataset:{},getBoundingClientRect:()=>({left:800,top:-700,width:240,height:280,bottom:-420})},character:{x:.5,y:.5,unit:()=>1,noticePointer:p=>noticed.push({...p})},events:new AbortController()};
  const host=Object.assign(new EventTarget(),{dataset:{},getBoundingClientRect:()=>({left:1130,top:640,width:150,height:160,right:1280,bottom:800})});
  try{
    attachPeek(stage,host,{getContext:()=>({})});
    for(let i=0;i<8;i++)stage.onBeforeFrame(5,1/60);
    assert.ok(noticed.length>0);assert.deepEqual(noticed.at(-1),stage.pointer);assert.ok(stage.pointer.x<stage.character.x);
  }finally{stage.events.abort();for(const name of names){if(previous[name]===undefined)delete globalThis[name];else globalThis[name]=previous[name];}}
});
