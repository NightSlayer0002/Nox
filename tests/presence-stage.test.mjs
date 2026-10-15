import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from '../public/js/stage.js';
import {Face} from '../public/js/face.js';

function fixture(){
  const stage=Object.create(Stage.prototype),face=new Face(),calls=[];
  Object.assign(stage,{canvas:{dataset:{}},forms:{face},character:face,form:'face',width:720,height:560,time:0,started:0,previous:0,pointer:{x:.5,y:.46},reduceMotion:false,render(){},prepareLiquid(){calls.push('load');}});
  const renderer={canvas:{dataset:{bodySource:'blender',appearance:'face'}},render(_face,_time,appearance){calls.push(appearance);return true;}};
  return {stage,face,renderer,calls};
}
function frames(run){
  const oldDocument=globalThis.document,oldFrame=globalThis.requestAnimationFrame;
  globalThis.document={hidden:false};globalThis.requestAnimationFrame=()=>1;
  try{run();}finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;if(oldFrame===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=oldFrame;}
}

test('normal Presence uses the 3D body and feeds its complete frame into the compositor',()=>frames(()=>{
  const {stage,renderer,calls}=fixture();stage.liquidRenderer=renderer;stage.liquidReady=true;
  stage.frame(1000);stage.frame(1040);
  assert.deepEqual(calls,['face','face']);assert.ok(stage.materialBlend>0);
  assert.equal(stage.canvas.dataset.bodySource,'blender');assert.equal(stage.canvas.dataset.appearance,'face');
}));

test('the default body loads only when its visible drawing area is usable',()=>frames(()=>{
  const {stage,calls}=fixture();stage.frame(1000);assert.deepEqual(calls,['load']);
  calls.length=0;stage.width=0;stage.frame(1040);assert.deepEqual(calls,[]);
  stage.width=720;stage.renderEnabled=false;stage.frame(1080);assert.deepEqual(calls,[]);
  stage.canvas.dataset.presence='peeking';stage.frame(1120);assert.deepEqual(calls,['load']);
  calls.length=0;document.hidden=true;stage.frame(1160);assert.deepEqual(calls,[]);
}));

test('switching normal and metal shares one renderer, physical state and ongoing narration',()=>frames(()=>{
  const {stage,face,renderer,calls}=fixture();stage.liquidRenderer=renderer;stage.liquidReady=true;face.speakingUntil=Infinity;
  stage.scene={action:'gravity',velocity:0,start:1};
  stage.frame(1000);stage.setForm('liquid');stage.frame(1040);stage.setForm('face');stage.frame(1080);
  assert.deepEqual(calls.filter(value=>value!=='load'),['face','liquid','face']);
  assert.equal(stage.character,face);assert.equal(face.speakingUntil,Infinity);assert.equal(stage.scene.action,'gravity');
}));

test('Signal leaves the normal body renderer idle and keeps its own presentation',()=>frames(()=>{
  const {stage,renderer,calls}=fixture();stage.liquidRenderer=renderer;stage.liquidReady=true;stage.form='core';
  stage.frame(1000);assert.deepEqual(calls,[]);assert.equal(stage.materialBlend,0);
}));

test('an offscreen stage pauses 3D work unless its face is being presented in the corner or finale',()=>frames(()=>{
  const {stage,calls}=fixture();stage.canvas.getBoundingClientRect=()=>({top:-800,bottom:-240});
  stage.frame(1000);assert.deepEqual(calls,[]);
  stage.canvas.dataset.presence='peeking';stage.frame(1040);assert.deepEqual(calls,['load']);
  calls.length=0;stage.canvas.dataset.presence='cinematic';stage.frame(1080);assert.deepEqual(calls,['load']);
}));

test('a recording keeps normal body animation live when its stage scrolls offscreen',()=>frames(()=>{
  const {stage,renderer,calls}=fixture();stage.liquidRenderer=renderer;stage.liquidReady=true;stage.recordingLocked=true;
  stage.canvas.getBoundingClientRect=()=>({top:-800,bottom:-240});
  stage.frame(1000);assert.deepEqual(calls,['face']);
  calls.length=0;document.hidden=true;stage.frame(1040);assert.deepEqual(calls,[]);
}));

test('an unavailable optional 3D module keeps its fallback without retrying every animation frame',async()=>{
  const stage=Object.create(Stage.prototype);Object.assign(stage,{canvas:{dataset:{}},form:'face'});
  // Node has no /dist browser module, exercising the real import-failure path.
  stage.prepareLiquid();await stage.liquidLoading;
  assert.equal(stage.canvas.dataset.liquid,'fallback');
  stage.prepareLiquid();assert.equal(stage.canvas.dataset.liquid,'fallback');
});
