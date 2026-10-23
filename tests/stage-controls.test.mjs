import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from '../public/js/stage.js';
import {Face} from '../public/js/face.js';
import {connectStageControls} from '../public/js/stage-controls.js';
import {createAfterimageBridge,applyAfterimageCue} from '../public/js/afterimage-bridge.js';
import {FIRST_CONTACT} from '../client/afterimage-example.js';

class Button extends EventTarget{
  constructor(dataset){super();this.dataset=dataset;this.attributes={};this.classList={toggle(){}};}
  setAttribute(key,value){this.attributes[key]=value;}
  click(){this.dispatchEvent(new Event('click'));}
}
function fixture(){
  const stage=Object.create(Stage.prototype),handlers=new Map(),face=new Face(),core=new Face();
  Object.assign(stage,{character:face,forms:{face,core},form:'face',time:1,width:580,height:340,pointer:{x:.5,y:.46},reduceMotion:false,events:new AbortController(),liquidRenderer:{}});
  stage.canvas={addEventListener:(name,handler)=>handlers.set(name,handler),getBoundingClientRect:()=>({left:0,top:0,width:580,height:340}),setPointerCapture(){}};
  stage.bindPointer();
  const sceneButtons=['gravity','orbit','takeover'].map(scene=>new Button({scene})),formButtons=['face','liquid','core'].map(form=>new Button({form}));
  const labels={none:'Ready',gravity:'Gravity',orbit:'Orbit',takeover:'Takeover'},label={};
  const expression=new Button({});expression.value='';
  connectStageControls(stage,{sceneButtons,formButtons,expressionControls:[expression],sceneLabel:label,labels});
  let stopCount=0,speechCount=0;
  const bridge=createAfterimageBridge({now:()=>0,setTimer:()=>1,clearTimer(){}});
  bridge.connect({cue:value=>applyAfterimageCue(stage,value),speak(){speechCount++;stage.character.speakingUntil=Infinity;},stop(){stopCount++;stage.character.speakingUntil=stage.time;stage.captionUntil=0;},getState:()=>({})});
  const fire=(type,x=290,y=156)=>handlers.get(type)({type,clientX:x,clientY:y,pointerId:1});
  return {stage,sceneButtons,formButtons,expression,label,bridge,fire,get stops(){return stopCount;},get speeches(){return speechCount;}};
}
test('quick expression controls preserve narration and disable for the faceless Signal form',()=>{
  const f=fixture();f.stage.speak({speech:'Still finishing this thought.',emotion:'curious',action:'none'});f.stage.character.speakingUntil=Infinity;
  f.expression.value='happy';f.expression.dispatchEvent(new Event('change'));
  assert.equal(f.stage.character.features(f.stage.time+.1).expression,'happy');
  assert.equal(f.stage.character.speakingUntil,Infinity);assert.equal(f.stage.caption,'Still finishing this thought.');
  f.formButtons[2].click();assert.equal(f.expression.disabled,true);
  f.formButtons[0].click();assert.equal(f.expression.disabled,false);assert.equal(f.stops,0);f.bridge.dispose();
});
test('Afterimage keeps its narration and cue captions while NOX is tapped, dragged, or changed by effects',()=>{
  const f=fixture();f.bridge.play(FIRST_CONTACT,0,0);
  const caption=f.stage.caption,until=f.stage.captionUntil;
  f.fire('pointerdown');f.fire('pointerup');
  f.fire('pointerdown');f.fire('pointermove',350,180);f.fire('pointerup',350,180);
  for(const button of f.sceneButtons){button.click();button.click();}
  for(const button of f.formButtons)button.click();
  f.stage.reset();
  assert.equal(f.bridge.snapshot().status,'playing');assert.equal(f.stops,0);assert.equal(f.speeches,1);
  assert.equal(f.stage.character.speakingUntil,Infinity);assert.equal(f.stage.caption,caption);assert.equal(f.stage.captionUntil,until);
  f.bridge.stop('user');assert.equal(f.stops,1);f.bridge.dispose();
});
test('conversation playback survives toggling physical effects and appearance with scene buttons still updating',()=>{
  const f=fixture();f.stage.speak({speech:'Keep telling this thought.',emotion:'curious',action:'none'});
  f.stage.character.speakingUntil=Infinity;
  f.sceneButtons[0].click();assert.equal(f.stage.scene.action,'gravity');assert.equal(f.label.textContent,'Gravity');
  f.sceneButtons[0].click();assert.equal(f.stage.scene,null);assert.equal(f.label.textContent,'Ready');
  f.formButtons[2].click();
  assert.equal(f.stage.character.speakingUntil,Infinity);assert.equal(f.stage.caption,'Keep telling this thought.');
  assert.equal(f.stops,0);f.bridge.dispose();
});
test('captions remain on the recording canvas throughout speech, then return to their normal expiry',()=>{
  const stage=Object.create(Stage.prototype),captions=[];
  Object.assign(stage,{landing:false,transparent:true,characterAlpha:0,time:20,caption:'The voice is still speaking.',captionUntil:5,character:new Face(),ctx:{setTransform(){},clearRect(){}},width:580,height:340,reduceMotion:true});
  stage.character.speakingUntil=Infinity;
  // Exercise the real recording render pass while omitting unrelated visuals.
  stage.drawCaption=text=>captions.push(text);
  stage.render();
  assert.deepEqual(captions,['The voice is still speaking.']);
  stage.character.speakingUntil=20;stage.render();assert.equal(captions.length,1);
});

test('a floating controller owns positioning while the shared stage keeps its scene state',()=>{
  const {stage}=fixture();stage.run('gravity');stage.externalPlacement=true;
  stage.character.x=.5;stage.character.y=.5;stage.character.scale=2.1;
  stage.time+=1;stage.animateScene(.04);
  assert.equal(stage.character.y,.5);assert.equal(stage.character.scale,2.1);
  assert.equal(stage.scene.action,'gravity');
  stage.externalPlacement=false;stage.animateScene(.04);
  assert.notEqual(stage.character.y,.5);
});

test('floating placement preserves scene expiry so Takeover returns after its moment',()=>{
  const {stage}=fixture();stage.externalPlacement=true;stage.run('takeover');
  stage.time+=11;stage.animateScene(.04);
  assert.equal(stage.scene,null);
  stage.run('gravity');stage.time+=11;stage.animateScene(.04);
  assert.equal(stage.scene.action,'gravity');
});
