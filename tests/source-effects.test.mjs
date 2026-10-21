import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileSourceProgram,createFrameBudget,createLiquidLogoRenderer,logoSurfaceSize,sourcePixelRatio,SOURCE_MATERIAL_FPS} from '../public/js/source-effects.js';
function context({compile=true,link=true}={}){const deleted=[];let next=0;return {deleted,VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,createShader:()=>++next,shaderSource(){},compileShader(){},getShaderParameter:()=>compile,getShaderInfoLog:()=> 'bad shader',deleteShader:s=>deleted.push(['shader',s]),createProgram:()=>++next,attachShader(){},linkProgram(){},getProgramParameter:()=>link,getProgramInfoLog:()=> 'bad link',deleteProgram:p=>deleted.push(['program',p])};}
test('source shaders release temporary shader objects after a successful link',()=>{const gl=context();assert.equal(compileSourceProgram(gl,'vertex','fragment'),3);assert.deepEqual(gl.deleted,[['shader',1],['shader',2]]);});
test('shader compilation failure releases already allocated resources',()=>{const gl=context({compile:false});assert.throws(()=>compileSourceProgram(gl,'vertex','fragment'),/bad shader/);assert.deepEqual(gl.deleted,[['shader',1]]);});
test('link failure releases both shaders and the failed program',()=>{const gl=context({link:false});assert.throws(()=>compileSourceProgram(gl,'vertex','fragment'),/bad link/);assert.equal(gl.deleted.filter(v=>v[0]==='shader').length,2);assert.equal(gl.deleted.filter(v=>v[0]==='program').length,1);});
test('frame budgeting resumes immediately after a hidden interval or clock epoch restart',()=>{const due=createFrameBudget(30);assert.equal(due(30000),true);assert.equal(due(30010),false);assert.equal(due(30034),true);assert.equal(due(90000),true);assert.equal(due(0),true);assert.equal(due(10),false);assert.equal(due(34),true);assert.equal(due(NaN),false);});
test('a bounded render clock preserves its cadence on a 16ms display without drift',()=>{
  const due=createFrameBudget(30);let frames=0;
  for(let now=0;now<1000;now+=16)if(due(now))frames++;
  assert.ok(frames>=29&&frames<=31,`Expected about 30 frames, got ${frames}`);
});
test('material cadence stays evenly divided across standard and fast displays',()=>{
  for(const refreshRate of [60,120]){
    const due=createFrameBudget(SOURCE_MATERIAL_FPS),ticks=[];
    for(let tick=0;tick<refreshRate;tick++)if(due(tick*1000/refreshRate))ticks.push(tick);
    assert.equal(ticks.length,30);
    assert.ok(ticks.slice(1).every((tick,index)=>tick-ticks[index]===refreshRate/30));
  }
});
test('surface detail follows feature pixels while dense displays and malformed sizes stay bounded',()=>{
  assert.equal(sourcePixelRatio(1),1);assert.equal(sourcePixelRatio(2),1.5);
  assert.equal(logoSurfaceSize(320,1),384);assert.equal(logoSurfaceSize(320,2),512);
  assert.equal(logoSurfaceSize(80,2),256);assert.equal(logoSurfaceSize(10000,2),768);
  for(const value of [NaN,Infinity,-Infinity,undefined,-100,0,Number.MAX_VALUE]){
    const size=logoSurfaceSize(value,value);
    assert.ok(Number.isFinite(size)&&size>=256&&size<=768&&size%128===0);
    assert.ok(Number.isFinite(sourcePixelRatio(value))&&sourcePixelRatio(value)>=1&&sourcePixelRatio(value)<=1.5);
  }
});
test('the original metal shader separates restrained grain from flow and survives lifecycle changes',async t=>{
  const gl=context(),uniforms=new Map(),shaders=[],listeners=new Map(),calls={draw:0,uploads:0,buffer:0,texture:0,lost:0};
  Object.assign(gl,{ARRAY_BUFFER:5,STATIC_DRAW:6,TEXTURE_2D:7,TEXTURE_WRAP_S:8,TEXTURE_WRAP_T:9,CLAMP_TO_EDGE:10,TEXTURE_MIN_FILTER:11,TEXTURE_MAG_FILTER:12,LINEAR:13,FLOAT:14,TEXTURE0:15,RGBA:16,UNSIGNED_BYTE:17,TRIANGLE_STRIP:18,COLOR_BUFFER_BIT:19,
    shaderSource:(shader,source)=>shaders.push(source),createBuffer:()=>1,createTexture:()=>2,useProgram(){},bindBuffer(){},bufferData(){},getAttribLocation:()=>0,enableVertexAttribArray(){},vertexAttribPointer(){},bindTexture(){},texParameteri(){},getUniformLocation:(program,name)=>name,
    uniform1f:(name,value)=>uniforms.set(name,value),uniform1i(){},uniform3f(){},uniform2f:(name,...value)=>uniforms.set(name,value),viewport(){},clearColor(){},clear(){},activeTexture(){},texImage2D:()=>calls.uploads++,drawArrays:()=>calls.draw++,isContextLost:()=>false,
    deleteBuffer:()=>calls.buffer++,deleteTexture:()=>calls.texture++,getExtension:()=>({loseContext:()=>calls.lost++})});
  const canvas={width:0,height:0,getContext:(kind,options)=>{assert.equal(kind,'webgl');assert.equal(options.preserveDrawingBuffer,true);return gl;},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  t.mock.method(globalThis,'fetch',async url=>({ok:true,text:()=>readFile(new URL(`../public${url}`,import.meta.url),'utf8')}));
  const renderer=await createLiquidLogoRenderer(canvas),mask={width:256};
  assert.ok(shaders.some(source=>source.includes('uniform float u_grainIntensity;')&&source.includes('noise * u_grainIntensity')));
  assert.equal(uniforms.get('u_grainIntensity'),.04);
  assert.equal(uniforms.get('u_noiseIntensity'),.035);
  assert.equal(renderer.render(mask,60,{size:logoSurfaceSize(320,2)}),true);
  assert.equal(canvas.width,512);assert.equal(canvas.height,512);assert.deepEqual(uniforms.get('u_resolution'),[512,512]);
  const phase=uniforms.get('u_time')*uniforms.get('u_speed');
  assert.equal(renderer.render(mask,60.1,{size:Infinity,pressure:1}),true);
  assert.ok(Math.abs(uniforms.get('u_time')*uniforms.get('u_speed')-phase-.056)<1e-8,'pressure advances the phase without multiplying the whole elapsed clock');
  assert.equal(canvas.width,256);assert.equal(calls.uploads,1);assert.equal(calls.draw,2);
  let restored=0;renderer.onRestore=()=>restored++;
  listeners.get('webglcontextlost')({preventDefault(){}});
  assert.equal(renderer.render(mask,2),false);assert.equal(calls.draw,2);
  listeners.get('webglcontextrestored')();assert.equal(restored,1);
  renderer.dispose();renderer.dispose();
  assert.equal(listeners.size,0);assert.equal(calls.buffer,1);assert.equal(calls.texture,1);assert.equal(calls.lost,1);
  assert.equal(renderer.render(mask,3),false);
});
