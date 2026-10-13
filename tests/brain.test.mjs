import test from 'node:test';
import assert from 'node:assert/strict';
import {Orb} from '../public/js/orb.js';

const originalDocument=globalThis.document,originalPath=globalThis.Path2D;
test.beforeEach(()=>{
  globalThis.Path2D=class {constructor(source){this.source=source;}};
  globalThis.document={hidden:false,createElement:()=>({width:0,height:0,getContext:()=>({beginPath(){},arc(){},fill(){}})})};
});
test.afterEach(()=>{globalThis.document=originalDocument;globalThis.Path2D=originalPath;});
function context(){const result={images:[],strokes:[],arcs:[],transforms:[]};return Object.assign(result,{save(){},restore(){},translate(...v){this.transforms.push(v);},rotate(){},scale(){},drawImage(...v){this.images.push(v);},stroke(p){this.strokes.push(p);},beginPath(){},arc(...v){this.arcs.push(v);},fill(){}});}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('Signal loads its brain only when drawn, and captures the renderer in the stage canvas',async()=>{
  let loads=0,renders=0;const canvas={},core=new Orb({loadRenderer:async()=>{loads++;return {canvas,render(){renders++;return true;},dispose(){}};}}),ctx=context();
  assert.equal(loads,0);core.draw(ctx,400,400,1);await settle();core.draw(ctx,400,400,2);
  assert.equal(loads,1);assert.equal(ctx.images.at(-1)[0],canvas);assert.equal(renders,1);
  core.draw(ctx,400,400,2.001);assert.equal(renders,1);core.dispose();
});
test('compact GPU cadence reuses captured pixels between updates',async()=>{
  let renders=0;const canvas={},core=new Orb({loadRenderer:async()=>({canvas,frameInterval:1/24,render(){renders++;return true;},dispose(){}})}),ctx=context();
  core.draw(ctx,400,400,1);await settle();core.draw(ctx,400,400,2);
  core.draw(ctx,400,400,2.034);assert.equal(renders,1);
  core.draw(ctx,400,400,2.05);assert.equal(renders,2);
  assert.equal(ctx.images.length,3);assert.ok(ctx.images.every(args=>args[0]===canvas));core.dispose();
});
test('asset failure keeps source brain paths visible and does not retry every frame',async()=>{
  let loads=0;const core=new Orb({loadRenderer:async()=>{loads++;throw Error('offline');}}),ctx=context();
  core.draw(ctx,400,400,1);await settle();core.draw(ctx,400,400,2);core.draw(ctx,400,400,3);
  assert.equal(loads,1);assert.ok(ctx.strokes.some(p=>p.source?.startsWith('M17.598')));assert.equal(ctx.arcs.length,0);core.dispose();
});
test('disposing a pending brain cancels loading and disposes a late result once',async()=>{
  let resolve,disposed=0,signal;const core=new Orb({loadRenderer:options=>{signal=options.signal;return new Promise(done=>{resolve=done;});}});
  core.draw(context(),400,400,1);assert.equal(typeof resolve,'function');core.dispose();core.dispose();resolve({canvas:{},render(){return true;},dispose(){disposed++;}});await settle();
  assert.equal(signal.aborted,true);assert.equal(disposed,1);assert.equal(core.renderer.available,false);
});
test('a lost GPU frame falls back to brain paths, then restoration reloads once',async()=>{
  let loads=0,disposed=0;const renderer={canvas:{},render:()=>false,dispose(){disposed++;}},core=new Orb({loadRenderer:async()=>{loads++;return renderer;}}),ctx=context();
  core.draw(ctx,400,400,1);await settle();core.draw(ctx,400,400,2);
  assert.equal(ctx.images.length,0);assert.ok(ctx.strokes.length>0);renderer.onRestore();await settle();
  assert.equal(loads,2);assert.equal(disposed,1);core.dispose();
});
test('motion preference freezes brain focus while preserving drag coordinates and brain hit bounds',()=>{
  const core=new Orb({loadRenderer:async()=>{throw Error('unused');}});core.x=.3;core.y=.4;core.targetX=.8;core.targetY=.7;
  core.update(3,.03,{x:1,y:1},true,true);assert.equal(core.x,.3);assert.equal(core.y,.4);assert.equal(core.focus.x,0);assert.equal(core.signal.motion,0);
  assert.equal(core.hitTest({x:.3,y:.4},400,400),true);assert.equal(core.hitTest({x:.95,y:.95},400,400),false);core.dispose();
});
