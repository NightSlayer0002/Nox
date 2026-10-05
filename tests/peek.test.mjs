import test from 'node:test';
import assert from 'node:assert/strict';
import { createPeekState, cursorForFace } from '../public/js/peek.js';

test('NOX peeks only after leaving the room, and returns without flickering near the boundary',()=>{
  const peek=createPeekState();
  assert.equal(peek.update({originalBottom:300,scrollTop:0,dt:1/60}).progress,0);
  for(let i=0;i<50;i++)peek.update({originalBottom:-20,scrollTop:700,dt:1/60});
  assert.equal(peek.docked,true);assert.ok(peek.progress>.99);
  peek.update({originalBottom:20,scrollTop:650,dt:1/60});assert.equal(peek.docked,true);
  for(let i=0;i<50;i++)peek.update({originalBottom:100,scrollTop:500,dt:1/60});
  assert.equal(peek.docked,false);assert.equal(peek.progress,0);
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
