import test from 'node:test';
import assert from 'node:assert/strict';
import {Face} from '../public/js/face.js';

// These checks catch input attention overriding speech/gestures or sticking after typing.
test('brief composer attention looks toward the input without interrupting narration',()=>{
  const face=new Face();face.emotion='happy';face.speakingUntil=Infinity;
  face.attendTo({x:-.3,y:1.2},10);face.update(10.1,.04,{x:1,y:0},false,false);
  assert.ok(face.gazeX<0);assert.ok(face.gazeY>0);
  assert.equal(face.speakingUntil,Infinity);assert.equal(face.emotion,'happy');
});

test('attention expires and direct pointer activity takes control again',()=>{
  const face=new Face();face.attendTo({x:-.3,y:1.2},10);
  for(let i=0;i<20;i++)face.update(12+i*.04,.04,{x:1,y:0},false,false);
  assert.ok(face.gazeX>0);assert.ok(face.gazeY<0);
  face.attendTo({x:-.3,y:1.2},14);face.noticePointer({x:1,y:0},14.1);face.update(14.2,.04,{x:1,y:0},false,false);
  assert.ok(face.gazeX>0);
});

test('thinking and held reactions retain priority over composer attention',()=>{
  const face=new Face();face.attendTo({x:0,y:1},10);face.activity='thinking';face.update(10.1,.04,{x:0,y:1},false,false);
  assert.ok(face.gazeY<0);assert.equal(face.features(10.1).expression,'thinking');
  face.setHeld(true,10.2);face.update(10.3,.04,{x:0,y:1},true,false);assert.ok(face.gazeY>0);
});

test('invalid input coordinates cannot poison gaze and reduced motion stays still',()=>{
  const face=new Face();face.attendTo({x:NaN,y:Infinity},10);face.update(10.1,.04,{x:.5,y:.5},false,false);
  assert.ok(Number.isFinite(face.gazeX)&&Number.isFinite(face.gazeY));
  face.attendTo({x:0,y:1},11);face.update(11.1,.04,{x:0,y:1},false,true);
  assert.equal(face.gazeX,0);assert.equal(face.gazeY,0);
});

test('a first animation timestamp before clock origin still renders without an attention target',()=>{
  const face=new Face();assert.doesNotThrow(()=>face.update(-.01,.016,{x:.8,y:.4},false,false));
  assert.ok(Number.isFinite(face.gazeX)&&Number.isFinite(face.gazeY));
});
