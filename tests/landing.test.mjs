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
  const canvas=Object.assign(new EventTarget(),{dataset:{},getContext:()=>({}),getBoundingClientRect:()=>({left:0,top:0,width:1280,height:800})});
  const discovered=[],landing=createLanding(canvas,{onDiscover:kind=>discovered.push(kind)});
  landing.stage.renderEnabled=false;
  const key=value=>{const event=new Event('keydown',{cancelable:true});Object.assign(event,{key:value});canvas.dispatchEvent(event);};
  try{callback({landing,key,discovered});}finally{landing.dispose();for(const name of keys){if(previous[name]===undefined)delete globalThis[name];else globalThis[name]=previous[name];}}
}
test('homepage keyboard relocation survives scroll pose updates until the next chapter',()=>withLanding(({landing,key,discovered})=>{
  landing.stage.onBeforeFrame();key('ArrowRight');const moved=landing.stage.character.x;
  for(let i=0;i<120;i++)landing.stage.frame(landing.stage.started+i*1000/60);
  assert.ok(Math.abs(landing.stage.character.x-moved)<.001);
  assert.ok(discovered.includes('drag'));
  landing.chapter();landing.stage.frame(landing.stage.started+3000);
  assert.equal(landing.stage.character.targetX,landing.pose.x);
  assert.equal(landing.stage.reduceMotion,false);
}));
test('Space greets NOX and records the same discovery as a pointer poke',()=>withLanding(({key,discovered})=>{
  key(' ');assert.ok(discovered.includes('poke'));
}));
