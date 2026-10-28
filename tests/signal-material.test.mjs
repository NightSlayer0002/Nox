import test from 'node:test';
import assert from 'node:assert/strict';
import {Orb} from '../public/js/orb.js';
const originalDocument=globalThis.document,originalPath=globalThis.Path2D;
test.beforeEach(()=>{globalThis.document={hidden:false};globalThis.Path2D=class {constructor(source){this.source=source;}};});
test.afterEach(()=>{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalPath===undefined)delete globalThis.Path2D;else globalThis.Path2D=originalPath;});
// Exercise real constructor state, with only GPU output replaced. Bypassing the
// constructor omitted its frame-budget reset hook and failed after a long gap.
// This fixture resolves fallback/composition behavior, not real GPU throughput.
function fixture(){const core=new Orb(),draws=[],strokes=[];Object.assign(core,{x:.5,y:.46,scale:1,rotation:0,focus:{x:0,y:0},pulseAt:-10,material:{canvas:{},render:()=>false},renderer:{available:true},signal:{motion:1,clock:0,intensity:.65}});const ctx={save(){},restore(){},translate(){},rotate(){},scale(){},drawImage:(...v)=>draws.push(v),stroke:p=>strokes.push(p)};return {core,ctx,draws,strokes};}
test('Signal stays visible as a source brain when its renderer reports lost context',()=>{const {core,ctx,draws,strokes}=fixture();core.draw(ctx,400,400,1);assert.equal(draws.length,0);assert.equal(strokes.length,8);assert.equal(core.renderer.available,false);});
test('Signal Glow changes a visible material composition property',()=>{const {core,ctx}=fixture(),levels=[];core.material.render=()=>true;ctx.drawImage=()=>levels.push(ctx.globalAlpha);core.signal.intensity=0;core.draw(ctx,400,400,1);core.signal.intensity=1;core.draw(ctx,400,400,2);assert.ok(levels[1]>levels[0]);});
