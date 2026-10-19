import test from 'node:test';
import assert from 'node:assert/strict';
import {Face} from '../public/js/face.js';
import {drawEyes} from '../public/js/face-art.js';

// Record the real canvas paths: each smiling eye is a quadratic curve. Its
// control point must stay above the endpoints while the eyelid closes.
function eyeCurves(face,time){
  const curves=[];let start;
  const ctx={
    beginPath(){},stroke(){},lineTo(){},
    moveTo(x,y){start={x,y};},
    quadraticCurveTo(x,y,endX,endY){curves.push({start,control:{x,y},end:{x:endX,y:endY}});},
  };
  drawEyes(ctx,face.features(time),face.gazeX,face.gazeY,time,'#fff',face.reduceMotion);
  return curves.slice(0,2).map(({start,control,end})=>({
    x:(start.x+end.x)/2,
    // A symmetric quadratic reaches half its control-point rise at t=.5.
    rise:(start.y+end.y)/2-control.y,
  }));
}

test('the hover smile closes continuously during a blink without reversing either eye',()=>{
  const face=new Face(),pointer={x:.51,y:.46};
  face.noticePointer(pointer,.1);face.update(1,.016,pointer,false,false);
  assert.equal(face.features(1).expression,'shy');
  let previous=eyeCurves(face,1.99),minimumRise=Infinity;
  for(let frame=0;frame<=12;frame++){
    const time=2+frame/60;face.update(time,1/60,pointer,false,false);
    const current=eyeCurves(face,time);
    for(let side=0;side<2;side++){
      assert.ok(current[side].rise>=0,`eye ${side} inverted at ${time}`);
      assert.ok(Math.abs(current[side].rise-previous[side].rise)<10,`eye ${side} jumped at ${time}`);
      minimumRise=Math.min(minimumRise,current[side].rise);
    }
    previous=current;
  }
  assert.ok(minimumRise<3,'the blink still closes the smiling eyes');
});

test('an intentional wink closes the left smile smoothly while the right smile keeps its shape and gaze',()=>{
  const face=new Face();face.gazeX=13;face.gazeY=-4;face.wink(1);
  const open=eyeCurves(face,1),closed=eyeCurves(face,1.21),restored=eyeCurves(face,1.43);
  assert.ok(closed[0].rise>=0,'the left eyelid must not turn downward');
  assert.ok(closed[0].rise<open[0].rise*.1,'the wink still closes its eye');
  assert.equal(closed[1].rise,open[1].rise,'the other eye stays open');
  assert.deepEqual(restored,open,'the wink restores the smile');
  assert.equal(closed[0].x,-34);assert.equal(closed[1].x,60);
});

test('angry eyes share a baseline and stay open enough to read as eyes',()=>{
  const face=new Face();face.preview('annoyed',0);
  const rectangles=[];
  const ctx={globalAlpha:1,save(){},restore(){},translate(){},scale(){},rotate(){},bezierCurveTo(){},beginPath(){},stroke(){},fill(){},moveTo(){},lineTo(){},roundRect(x,y,w,h){rectangles.push({x,y,w,h});}};
  drawEyes(ctx,face.features(.3),0,0,.3,'#fff',false);
  assert.equal(rectangles.length,2);
  assert.equal(rectangles[0].y,rectangles[1].y);
  assert.equal(rectangles[0].h,rectangles[1].h);
  assert.ok(rectangles[0].h>=28,'angry eyes should not collapse into thin slits');
});
