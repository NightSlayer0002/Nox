import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiquidGeometry} from '../client/liquid-geometry.js';
import {LIQUID_FRAME_SIZE} from '../public/js/liquid-frame.js';
import {drawEyes} from '../public/js/face-art.js';
import {Face} from '../public/js/face.js';

test('liquid NOX is a bounded closed volume with real depth and finite surface coordinates',()=>{
  const geometry=createLiquidGeometry();geometry.computeBoundingBox();const box=geometry.boundingBox;
  assert.ok(box.max.z-box.min.z>150);
  assert.ok(box.max.x-box.min.x>=289&&box.max.x-box.min.x<=291);
  assert.ok(box.max.y-box.min.y>=289&&box.max.y-box.min.y<=291);
  assert.ok(Math.abs((box.min.z+box.max.z)/2)<.001);
  for(const attribute of ['position','normal','uv'])for(const value of geometry.attributes[attribute].array)assert.ok(Number.isFinite(value));
  assert.ok(geometry.attributes.position.count<30000);geometry.dispose();
});

test('the liquid camera frame contains every drifting sleep mark, including its font height',()=>{
  const bounds=[],target={font:'',globalAlpha:1};
  const ctx=new Proxy(target,{get:(object,name)=>name==='fillText'?(_text,x,y)=>bounds.push({x,y,size:parseFloat(object.font.split(' ')[1])}):object[name]??(()=>{}),set:(object,name,value)=>{object[name]=value;return true;}});
  const face=new Face();face.preview('sleepy',0,100);
  for(let time=0;time<4;time+=.02)drawEyes(ctx,face.features(time),0,0,time,'#fff',false);
  assert.ok(bounds.length>100);
  for(const {x,y,size} of bounds){assert.ok(y-size>-LIQUID_FRAME_SIZE/2,'topmost z must not be cropped');assert.ok(x+size<LIQUID_FRAME_SIZE/2);}
});
