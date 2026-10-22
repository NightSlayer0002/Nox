import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from '../public/js/stage.js';
import {Face} from '../public/js/face.js';

function withDisplay(run){
  const previousDocument=globalThis.document,previousFrame=globalThis.requestAnimationFrame;
  globalThis.document={hidden:false};globalThis.requestAnimationFrame=()=>1;
  try{run();}finally{
    if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
    if(previousFrame===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=previousFrame;
  }
}

function bodyStage(){
  const stage=Object.create(Stage.prototype),face=new Face(),rendered=[];
  Object.assign(stage,{
    canvas:{dataset:{}},forms:{face},character:face,form:'face',width:720,height:560,
    started:0,previous:0,time:0,pointer:{x:.5,y:.46},reduceMotion:false,render(){},
    liquidRenderer:{canvas:{dataset:{}},render(_face,time){rendered.push(time);return true;}}
  });
  return {stage,rendered};
}

// Exercise Stage's actual gate: testing the scheduler helper alone would miss
// a caller that discards display-tick overshoot and silently falls below 30fps.
for(const refreshRate of [60,90,120,144]){
  test(`the body retains its 30fps cadence on a ${refreshRate}Hz display`,()=>withDisplay(()=>{
    const {stage,rendered}=bodyStage();
    for(let tick=0;tick<refreshRate*10;tick++)stage.frame(tick*1000/refreshRate);
    assert.equal(rendered.length,300,'ten seconds should produce 300 body frames');
    const maximumInterval=Math.ceil(refreshRate/30)/refreshRate+.000001;
    assert.ok(rendered.slice(1).every((time,index)=>time-rendered[index]<=maximumInterval),
      'a due body frame should not slip an extra display tick');
  }));
}

test('a hidden body resumes with one current frame and preserves the frame budget',()=>withDisplay(()=>{
  const {stage,rendered}=bodyStage();
  stage.frame(0);document.hidden=true;
  for(let tick=1;tick<=60;tick++)stage.frame(tick*1000/60);
  assert.equal(rendered.length,1,'hidden stages should not draw the body');
  document.hidden=false;stage.frame(1010);
  assert.equal(rendered.length,2,'visibility resumes without replaying missed frames');
  stage.frame(1011);assert.equal(rendered.length,2,'resume must still respect the body budget');
}));
