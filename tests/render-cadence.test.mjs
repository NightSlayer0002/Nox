import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import {Orb} from '../public/js/orb.js';
import * as THREE from 'three';

const root=path.resolve(import.meta.dirname,'..'),nativeRequire=createRequire(import.meta.url);
const atmosphereBundle=await build({entryPoints:[path.join(root,'client/cinematic-atmosphere.js')],bundle:true,write:false,platform:'node',format:'cjs',external:['three'],plugins:[{name:'shared-frame-budget',setup(builder){builder.onResolve({filter:/^\/js\/source-effects\.js$/},()=>({path:path.join(root,'public/js/source-effects.js')}));}}]});

class TrackedTarget extends EventTarget{
  listeners=new Map();
  addEventListener(type,listener,options){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener);super.addEventListener(type,listener,options);}
  removeEventListener(type,listener,options){this.listeners.get(type)?.delete(listener);super.removeEventListener(type,listener,options);}
  count(type){return this.listeners.get(type)?.size||0;}
}

async function withDisplay(run){
  const previous=globalThis.document,display=new TrackedTarget();display.hidden=false;globalThis.document=display;
  try{await run(display);}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
}

const budgets=[{name:'default brain',fps:30},{name:'compact brain',fps:24},{name:'atmosphere',fps:15}];
async function caller({name,fps}){
  let now=0;const rendered=[],ctx={save(){},restore(){},translate(){},rotate(){},scale(){},drawImage(){},clearRect(){}};
  if(name!=='atmosphere'){
    const orb=new Orb({loadRenderer:async()=>({canvas:{},...(fps===24?{frameInterval:1/24}:{}),render(){rendered.push(now);return true;},dispose(){}})});
    await orb.loadMaterial();
    return {rendered,draw(time){now=time;orb.draw(ctx,400,400,time/1000);},async restore(){orb.material.onRestore();await orb.loadingMaterial;},dispose:()=>orb.dispose()};
  }
  const module={exports:{}};
  vm.runInNewContext(atmosphereBundle.outputFiles[0].text,{module,exports:module.exports,require:id=>id==='three'?THREE:nativeRequire(id),document:globalThis.document});
  const surface=new TrackedTarget(),renderer={domElement:surface,render(){rendered.push(now);}},canvas={width:0,height:0,getContext:()=>ctx};
  const atmosphere=module.exports.createCinematicAtmosphere(renderer,{},canvas,false);atmosphere.resize(800,600);
  return {rendered,surface,draw(time){now=time;atmosphere.render(time/1000);},async restore(){surface.dispatchEvent(new Event('webglcontextrestored'));},dispose:()=>atmosphere.dispose()};
}

for(const budget of budgets)for(const refreshRate of [30,60,90,120,144])for(const jitter of [false,true])test(`${budget.name} keeps its ${budget.fps}fps budget on ${refreshRate}Hz ticks${jitter?' with bounded lateness jitter':''}`,()=>withDisplay(async()=>{
  // Question: Does the actual caller retain its requested cadence without discarding display-tick overshoot?
  // Limit: Deterministic timestamps and stub render/canvas work; no real GPU, physical display, visual quality or energy measurement.
  const view=await caller(budget),lateness=[0,.03,.01,.04,.02,.025];
  try{
    for(let tick=0;tick<refreshRate*10;tick++)view.draw((tick+(jitter?lateness[tick%lateness.length]:0))*1000/refreshRate);
    assert.equal(view.rendered.length,budget.fps*10,'ten seconds should retain the requested number of updates');
    const maximumGap=(Math.ceil(refreshRate/budget.fps)+(jitter?.04:0))*1000/refreshRate+.02;
    assert.ok(view.rendered.slice(1).every((time,index)=>time-view.rendered[index]<=maximumGap),'a due render must not slip an avoidable extra display tick');
  }finally{view.dispose();}
}));

for(const budget of budgets)test(`${budget.name} resumes immediately after hidden intervals without replaying frames`,()=>withDisplay(async display=>{
  // Question: Does visibility reset the actual caller even when it receives no hidden draw callbacks?
  // Limit: Synthetic visibility events and render counts; browser throttling, hidden-time animation state and GPU work are not measured.
  const view=await caller(budget);
  try{
    view.draw(0);display.hidden=true;display.dispatchEvent(new Event('visibilitychange'));
    display.hidden=false;display.dispatchEvent(new Event('visibilitychange'));view.draw(10);
    assert.equal(view.rendered.length,2,'a short hidden interval must not delay the first visible update');
    view.draw(11);assert.equal(view.rendered.length,2);
    display.hidden=true;display.dispatchEvent(new Event('visibilitychange'));view.draw(5000);view.draw(10000);
    assert.equal(view.rendered.length,2,'hidden calls must not draw');
    display.hidden=false;display.dispatchEvent(new Event('visibilitychange'));view.draw(10001);view.draw(10002);
    assert.equal(view.rendered.length,3,'resume produces one current frame, not a catch-up burst');
    view.draw(10001+1000/budget.fps);assert.equal(view.rendered.length,4);
  }finally{view.dispose();}
  assert.equal(display.count('visibilitychange'),0,'disposal must release the added budget listener');
}));

for(const budget of budgets)test(`${budget.name} resets after a clock restart or long gap without an extra catch-up render`,()=>withDisplay(async()=>{
  // Question: Does a backward clock or long scheduling gap start one fresh budget interval?
  // Limit: Supplied clock epochs and a selected long gap; no claim about operating-system scheduling or perceived smoothness.
  const view=await caller(budget),interval=1000/budget.fps;
  try{
    view.draw(0);view.draw(interval);view.draw(5);assert.equal(view.rendered.length,3,'clock restart must render immediately');
    view.draw(6);assert.equal(view.rendered.length,3);
    const late=5+1000*interval-.5;view.draw(late);assert.equal(view.rendered.length,4);
    view.draw(late);view.draw(late+1);assert.equal(view.rendered.length,4,'missed frames must not create an early follow-up update');
    view.draw(late+interval);assert.equal(view.rendered.length,5);
  }finally{view.dispose();}
}));

for(const budget of budgets)test(`${budget.name} resets its cadence after context restoration and releases listeners on disposal`,()=>withDisplay(async display=>{
  // Question: Does the first restored/replacement material update immediately and then respect its normal interval?
  // Limit: Brain onRestore callback or synthetic canvas restoration event with stub rendering; no actual WebGL loss/resource recovery is exercised.
  const view=await caller(budget);
  try{
    view.draw(0);await view.restore();view.draw(10);assert.equal(view.rendered.length,2);
    view.draw(11);assert.equal(view.rendered.length,2);view.draw(10+1000/budget.fps);assert.equal(view.rendered.length,3);
  }finally{view.dispose();}
  assert.equal(display.count('visibilitychange'),0);
  if(view.surface)assert.equal(view.surface.count('webglcontextrestored'),0);
}));
