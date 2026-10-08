import test from 'node:test';
import assert from 'node:assert/strict';
import {Orb} from '../public/js/orb.js';
const originalDocument=globalThis.document;
test.beforeEach(()=>{globalThis.document={hidden:false};});
test.afterEach(()=>{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;});
function fixture(){const core=Object.create(Orb.prototype),draws=[],arcs=[];Object.assign(core,{x:.5,y:.46,scale:1,rotation:0,focus:{x:0,y:0},pulseAt:-10,mask:{},material:{canvas:{},render:()=>false},renderer:{available:true},signal:{motion:1,clock:0,intensity:.65}});const ctx={save(){},restore(){},translate(){},rotate(){},scale(){},drawImage:(...v)=>draws.push(v),beginPath(){},arc:(...v)=>arcs.push(v),fill(){}};return {core,ctx,draws,arcs};}
test('Signal stays visible when its source renderer reports lost context',()=>{const {core,ctx,draws,arcs}=fixture();core.draw(ctx,400,400,1);assert.equal(draws.length,0);assert.equal(arcs.length,1);assert.equal(core.renderer.available,false);});
test('Signal Glow changes a visible material composition property',()=>{const {core,ctx}=fixture(),levels=[];core.material.render=()=>true;ctx.drawImage=()=>levels.push(ctx.globalAlpha);core.signal.intensity=0;core.draw(ctx,400,400,1);core.signal.intensity=1;core.draw(ctx,400,400,2);assert.ok(levels[1]>levels[0]);});
