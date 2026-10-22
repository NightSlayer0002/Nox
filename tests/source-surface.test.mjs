import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';

async function createSurface(t,renderer,options={}){
  let module;
  try{module=await import('../client/source-surface.js');}
  catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')assert.fail('The same-context liquid surface helper is missing');throw error;}
  t.mock.method(globalThis,'fetch',async url=>({ok:true,text:()=>readFile(new URL(`../public${url}`,import.meta.url),'utf8')}));
  return module.createLiquidLogoSurface({renderer,...options});
}

// Only the WebGL boundary is substituted: the scene, target, geometry,
// material, textures, and uniforms exercised below are real Three objects.
function rendererDouble(){
  const original=new THREE.WebGLRenderTarget(900,600),clearColor=new THREE.Color('#58776b');
  const state={target:original,face:3,mip:2,clearColor,clearAlpha:.65,contextLost:false,draws:[],clears:[],throwOnDraw:false};
  const renderer={autoClear:true,xr:{enabled:true},capabilities:{getMaxAnisotropy:()=>16},
    getContext:()=>({isContextLost:()=>state.contextLost}),getRenderTarget:()=>state.target,
    getActiveCubeFace:()=>state.face,getActiveMipmapLevel:()=>state.mip,
    setRenderTarget(target,face=0,mip=0){state.target=target;state.face=face;state.mip=mip;},
    getClearColor:out=>out.copy(state.clearColor),getClearAlpha:()=>state.clearAlpha,
    setClearColor(color,alpha){state.clearColor.set(color);state.clearAlpha=alpha;},
    clear(...flags){state.clears.push({target:state.target,color:state.clearColor.clone(),alpha:state.clearAlpha,flags});},
    render(scene,camera){
      state.draws.push({target:state.target,scene,camera,autoClear:this.autoClear,xr:this.xr.enabled});
      if(state.throwOnDraw)throw Error('draw failed');
    }};
  return {renderer,state,original};
}

test('the surface renders into the existing context and restores the callers target and clear state',async t=>{
  const {renderer,state,original}=rendererDouble(),before=state.clearColor.clone();
  const surface=await createSurface(t,renderer);
  assert.equal(surface.render({width:256,height:256},60,{size:512}),true);
  const draw=state.draws[0],pass=draw.scene.children[0];
  assert.equal(draw.target.texture,surface.texture);
  assert.equal(draw.target.width,512);assert.equal(draw.target.height,512);
  assert.ok(draw.scene.isScene);assert.ok(draw.camera.isCamera);
  assert.ok(pass.material.isRawShaderMaterial);
  assert.equal(pass.geometry.attributes.aVertexPosition.count,4);
  assert.equal(pass.material.depthTest,false);assert.equal(pass.material.depthWrite,false);
  assert.equal(pass.material.blending,THREE.NoBlending);assert.equal(pass.material.toneMapped,false);
  assert.equal(draw.autoClear,false);assert.equal(draw.xr,false);
  assert.equal(state.clears.length,1);assert.equal(state.clears[0].target,draw.target);
  assert.equal(state.clears[0].color.getHex(),0);assert.equal(state.clears[0].alpha,0);
  assert.deepEqual(state.clears[0].flags,[true,false,false]);
  assert.equal(state.target,original);assert.equal(state.face,3);assert.equal(state.mip,2);
  assert.deepEqual(state.clearColor,before);assert.equal(state.clearAlpha,.65);
  assert.equal(renderer.autoClear,true);assert.equal(renderer.xr.enabled,true);
  surface.dispose();original.dispose();
});

test('the original color field keeps sRGB storage, straight alpha, orientation, and source parameters',async t=>{
  const {renderer,state,original}=rendererDouble(),surface=await createSurface(t,renderer);
  const mask={width:256,height:256};surface.render(mask,60,{size:512});
  const target=state.draws[0].target,material=state.draws[0].scene.children[0].material;
  assert.equal(target.texture.colorSpace,THREE.SRGBColorSpace);
  assert.equal(target.texture.type,THREE.UnsignedByteType);
  assert.equal(target.texture.flipY,false);assert.equal(target.texture.premultiplyAlpha,false);
  assert.equal(target.texture.generateMipmaps,false);
  assert.equal(target.texture.minFilter,THREE.LinearFilter);assert.equal(target.texture.magFilter,THREE.LinearFilter);
  assert.equal(target.texture.anisotropy,4);assert.equal(target.depthBuffer,false);assert.equal(target.stencilBuffer,false);assert.equal(target.samples,0);
  const uniforms=material.uniforms;
  assert.equal(uniforms.u_iterations.value,15);assert.equal(uniforms.u_grainIntensity.value,.04);
  assert.equal(uniforms.u_noiseIntensity.value,.035);assert.equal(uniforms.u_scale.value,3.5);
  assert.equal(uniforms.u_intensityFactor.value,.18);assert.equal(uniforms.u_speed.value,.28);
  assert.equal(uniforms.u_logoTexture.value.image,mask);
  assert.equal(uniforms.u_logoTexture.value.flipY,false);
  assert.equal(uniforms.u_logoTexture.value.colorSpace,THREE.NoColorSpace);
  assert.deepEqual(uniforms.u_resolution.value.toArray(),[512,512]);
  const vendor=await readFile(new URL('../public/vendor/liquid-logo/fragment-shader.glsl',import.meta.url),'utf8');
  // The whole upstream field remains present; only the existing grain control
  // and the storage transfer wrapper may adapt its output for this context.
  const field=vendor.replace('uniform float u_noiseIntensity;','uniform float u_noiseIntensity;\nuniform float u_grainIntensity;')
    .replace('o = o + vec4(noise);','o = o + vec4(noise * u_grainIntensity);')
    .replace('void main()','void noxSurfaceMain()');
  assert.ok(material.fragmentShader.includes(field));
  assert.match(material.fragmentShader,/noxSurfaceMain\(\);[\s\S]*gl_FragColor\.rgb\s*=\s*noxSurfaceEOTF\(gl_FragColor\.rgb\)/);
  assert.match(material.fragmentShader,/0\.04045/);
  assert.match(material.fragmentShader,/vec3\(lessThanEqual\(value, vec3\(0\.04045\)\)\)/,'the legacy upstream GLSL needs a float mix selector, not the GLSL 3 boolean overload');
  assert.equal(material.vertexShader,await readFile(new URL('../public/vendor/liquid-logo/vertex-shader.glsl',import.meta.url),'utf8'));
  surface.dispose();original.dispose();
});

test('surface time integrates changing pressure and resized storage keeps the material map identity',async t=>{
  const {renderer,state,original}=rendererDouble(),surface=await createSurface(t,renderer),mask={width:256,height:256};
  surface.render(mask,60,{size:512});
  const texture=surface.texture,maskTexture=state.draws[0].scene.children[0].material.uniforms.u_logoTexture.value;
  const uniforms=state.draws[0].scene.children[0].material.uniforms,phase=uniforms.u_time.value*uniforms.u_speed.value;
  let changes=0;state.draws[0].target.addEventListener('dispose',()=>changes++);
  surface.render(mask,60.1,{pressure:1,size:383});
  assert.equal(surface.texture,texture);assert.equal(surface.size,384);assert.equal(changes,1);
  assert.equal(uniforms.u_logoTexture.value,maskTexture);
  assert.ok(Math.abs(uniforms.u_time.value*uniforms.u_speed.value-phase-.056)<1e-8);
  surface.render(mask,60.2,{pressure:0,size:383});assert.equal(changes,1);
  surface.render(mask,0,{size:Infinity});assert.equal(surface.size,256);assert.equal(changes,2);
  assert.equal(uniforms.u_time.value,0);
  surface.dispose();original.dispose();
});

test('draw failure restores renderer state and lost contexts never draw or advance the surface clock',async t=>{
  const {renderer,state,original}=rendererDouble(),surface=await createSurface(t,renderer),mask={width:256,height:256};
  renderer.autoClear=false;renderer.xr.enabled=false;state.throwOnDraw=true;
  assert.throws(()=>surface.render(mask,60),/draw failed/);
  assert.equal(state.target,original);assert.equal(state.face,3);assert.equal(state.mip,2);
  assert.equal(renderer.autoClear,false);assert.equal(renderer.xr.enabled,false);assert.equal(state.clearAlpha,.65);
  state.throwOnDraw=false;state.contextLost=true;
  assert.equal(surface.render(mask,80),false);assert.equal(state.draws.length,1);
  state.contextLost=false;
  assert.equal(surface.render(mask,60.1),true);
  const uniforms=state.draws[1].scene.children[0].material.uniforms;
  assert.ok(Math.abs(uniforms.u_time.value*uniforms.u_speed.value-16.828)<1e-8);
  surface.dispose();original.dispose();
});

test('surface disposal releases owned GPU resources once and leaves caller resources intact',async t=>{
  const {renderer,state,original}=rendererDouble(),surface=await createSurface(t,renderer),mask={width:256,height:256};
  surface.render(mask,0);const target=state.draws[0].target,pass=state.draws[0].scene.children[0];
  const disposals={target:0,geometry:0,material:0,mask:0,caller:0};
  target.addEventListener('dispose',()=>disposals.target++);pass.geometry.addEventListener('dispose',()=>disposals.geometry++);
  pass.material.addEventListener('dispose',()=>disposals.material++);pass.material.uniforms.u_logoTexture.value.addEventListener('dispose',()=>disposals.mask++);
  original.addEventListener('dispose',()=>disposals.caller++);
  surface.dispose();surface.dispose();
  assert.deepEqual(disposals,{target:1,geometry:1,material:1,mask:1,caller:0});
  assert.equal(surface.render(mask,1),false);assert.equal(state.draws.length,1);
  original.dispose();
});
