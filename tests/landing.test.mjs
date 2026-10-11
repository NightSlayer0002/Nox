import test from 'node:test';
import assert from 'node:assert/strict';
import {createLanding} from '../public/js/landing.js';

function withLanding(callback){
  const keys=['document','matchMedia','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','devicePixelRatio'];
  const previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  Object.assign(globalThis,{
    document:new EventTarget(),devicePixelRatio:1,
    matchMedia:()=>Object.assign(new EventTarget(),{matches:true}),
    ResizeObserver:class{observe(){} disconnect(){}},
    requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}
  });
  const canvas=Object.assign(new EventTarget(),{dataset:{},getContext:()=>({}),setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:1280,height:800})});
  const discovered=[],landing=createLanding(canvas,{onDiscover:kind=>discovered.push(kind)});
  landing.stage.renderEnabled=false;
  const key=value=>{const event=new Event('keydown',{cancelable:true});Object.assign(event,{key:value});canvas.dispatchEvent(event);};
  const pointer=(type,x,y)=>{const event=new Event(type);Object.assign(event,{pointerId:1,button:0,clientX:x,clientY:y});canvas.dispatchEvent(event);};
  try{callback({landing,key,pointer,discovered});}finally{landing.dispose();for(const name of keys){if(previous[name]===undefined)delete globalThis[name];else globalThis[name]=previous[name];}}
}
test('homepage NOX stays anchored when arrow keys are pressed',()=>withLanding(({landing,key,discovered})=>{
  landing.stage.onBeforeFrame();key('ArrowRight');key('ArrowDown');
  for(let i=0;i<120;i++)landing.stage.frame(landing.stage.started+i*1000/60);
  assert.equal(landing.stage.character.x,landing.pose.x);assert.equal(landing.stage.character.y,landing.pose.y);
  assert.equal(discovered.includes('drag'),false);
  landing.chapter();landing.stage.frame(landing.stage.started+3000);
  assert.equal(landing.stage.character.targetX,landing.pose.x);
  assert.equal(landing.stage.reduceMotion,false);
}));
test('homepage pointer movement cannot drag him outside his frame, while clicks and gaze remain live',()=>withLanding(({landing,pointer,discovered})=>{
  landing.stage.onBeforeFrame();
  pointer('pointerdown',640,400);pointer('pointermove',1280,800);pointer('pointerup',1280,800);
  assert.equal(landing.stage.dragging,false);assert.equal(landing.stage.character.held,false);
  assert.equal(landing.stage.character.x,.5);assert.equal(landing.stage.character.y,.5);
  landing.stage.character.update(1,.05,landing.stage.pointer,false,false);assert.ok(landing.stage.character.gazeX>0);
  pointer('click',640,400);assert.ok(discovered.includes('poke'));assert.equal(landing.stage.character.features(landing.stage.time).expression,'happy');
}));
test('Space greets NOX and records the same discovery as a pointer poke',()=>withLanding(({key,discovered})=>{
  key(' ');assert.ok(discovered.includes('poke'));
}));
