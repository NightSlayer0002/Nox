import test from 'node:test';
import assert from 'node:assert/strict';
import {emblemPose,emblemPointer,emblemChapter} from '../public/js/home-choreography.js';
import {Vector3,Euler} from 'three';

const anchors=[0,900,1800,3100,4100];
test('scene navigation selects an anchor landing even with fractional scroll rounding',()=>{
  assert.equal(emblemChapter(899.4,anchors),1);assert.equal(emblemChapter(3099.8,anchors),3);
  assert.equal(emblemChapter(2000,anchors),2);assert.equal(emblemChapter(880,anchors),0);
  assert.equal(emblemChapter(5000,anchors),3);assert.equal(emblemChapter(NaN,anchors),0);
});
test('the background emblem changes sides and faces the paragraph at each desktop chapter',()=>{
  for(let i=0;i<4;i++){
    const pose=emblemPose(anchors[i],anchors,false),normal=new Vector3(0,0,1).applyEuler(new Euler(pose.x,pose.y,pose.z));
    assert.ok(i%2===0?pose.screenX>.65:pose.screenX<.35);
    assert.ok(i%2===0?normal.x<0:normal.x>0);
  }
  assert.ok(emblemPose(anchors[4],anchors,false).opacity<.3);
});
test('scrolling backwards reproduces the same pose and a pin dwell does not move the emblem early',()=>{
  const before=emblemPose(2000,anchors,false);
  emblemPose(3500,anchors,false);
  assert.deepEqual(emblemPose(2000,anchors,false),before);
  assert.ok(before.screenX>.65);
  for(let scroll=-100;scroll<4500;scroll+=13)for(const value of Object.values(emblemPose(scroll,anchors,false)))assert.ok(Number.isFinite(value));
});
test('the eyes and smile separate during a chapter crossing and assemble again on arrival',()=>{
  const departing=emblemPose(0,anchors,false),crossing=emblemPose(900*.65,anchors,false),arriving=emblemPose(900,anchors,false);
  assert.ok(crossing.spread>departing.spread+1);assert.ok(crossing.spread>arriving.spread+1);
  assert.ok(crossing.screenX>arriving.screenX&&crossing.screenX<departing.screenX);
  assert.ok(crossing.z<departing.z);
});
test('the emblem settles before the next copy center and crosses with continuous velocity',()=>{
  const settled=emblemPose(900*.97,anchors),arrived=emblemPose(900,anchors);
  for(const key of Object.keys(arrived))assert.ok(Math.abs(settled[key]-arrived[key])<1e-10);
  const a=emblemPose(900*.35-.01,anchors),b=emblemPose(900*.35+.01,anchors);
  assert.ok(Math.abs(a.screenX-b.screenX)<1e-6);
  const c=emblemPose(900*.95-.01,anchors),d=emblemPose(900*.95+.01,anchors);
  assert.ok(Math.abs(c.screenX-d.screenX)<1e-6);
});
test('mobile choreography reserves the upper part of the screen for copy and all pointer turns stay bounded',()=>{
  for(const scroll of anchors){const pose=emblemPose(scroll,anchors,true);assert.ok(pose.screenY>=.7);assert.ok(pose.size<=.55);}
  const pose=emblemPose(0,anchors,false),above=emblemPointer({x:.7,y:0},pose),below=emblemPointer({x:.7,y:1},pose);
  assert.ok(above.x<0);assert.ok(below.x>0);
  assert.deepEqual(emblemPointer({x:NaN,y:Infinity},pose),{x:0,y:0});
  const extreme=emblemPointer({x:-100,y:100},pose);assert.ok(Math.abs(extreme.x)<=.1&&Math.abs(extreme.y)<=.16);
});
