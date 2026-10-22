import * as THREE from 'three';
import {sourceShader,logoPressure,logoSurfaceSize} from '../public/js/source-effects.js';

// The upstream shader writes display-encoded RGB into an ordinary WebGL canvas.
// CanvasTexture stores those bytes as sRGB before the physical material samples
// them. An sRGB framebuffer encodes on write, so decode this one output first:
// the target keeps the same sRGB bytes and the material keeps its normal decode.
const outputTransfer=`
vec3 noxSurfaceEOTF(vec3 value) {
  return mix(pow((value + vec3(0.055)) / 1.055, vec3(2.4)),
    value / 12.92, vec3(lessThanEqual(value, vec3(0.04045))));
}
void main() {
  noxSurfaceMain();
  gl_FragColor.rgb = noxSurfaceEOTF(gl_FragColor.rgb);
}`;

// Keep the liquid field on the emblem's GPU context. Surface cadence remains
// owned by its caller, and the texture identity survives resolution buckets.
export async function createLiquidLogoSurface({renderer,size=256}){
  const [vertex,fragment]=await Promise.all([
    sourceShader('/vendor/liquid-logo/vertex-shader.glsl'),
    sourceShader('/vendor/liquid-logo/fragment-shader.glsl')
  ]);
  const surfaceFragment=fragment
    .replace('uniform float u_noiseIntensity;','uniform float u_noiseIntensity;\nuniform float u_grainIntensity;')
    .replace('o = o + vec4(noise);','o = o + vec4(noise * u_grainIntensity);')
    .replace('void main()','void noxSurfaceMain()');
  const dimension=logoSurfaceSize(size);
  const target=new THREE.WebGLRenderTarget(dimension,dimension,{
    depthBuffer:false,stencilBuffer:false,samples:0,colorSpace:THREE.SRGBColorSpace,
    type:THREE.UnsignedByteType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
    generateMipmaps:false,anisotropy:Math.max(1,Math.min(4,renderer.capabilities.getMaxAnisotropy()))
  });
  const values={...logoPressure(0),iterations:15,dotFactor:.04,dotMultiplier:.21,vOffset:5.1,
    expFactor:.6,colorShift:.9,logoInteractStrength:.4,grainIntensity:.04,
    logoOpacity:1,logoScale:1,logoAspectRatio:1};
  const uniforms=Object.fromEntries(Object.entries(values).map(([key,value])=>[`u_${key}`,{value}]));
  Object.assign(uniforms,{
    u_time:{value:0},u_resolution:{value:new THREE.Vector2(dimension,dimension)},
    u_colorFactors:{value:new THREE.Vector3(.9,.9,.9)},u_logoTexture:{value:null},u_logoBlendMode:{value:0}
  });
  const material=new THREE.RawShaderMaterial({uniforms,vertexShader:vertex,
    fragmentShader:surfaceFragment+outputTransfer,
    depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false});
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('aVertexPosition',new THREE.Float32BufferAttribute([-1,-1,1,-1,-1,1,1,1],2));
  geometry.setIndex([0,1,2,2,1,3]);
  const scene=new THREE.Scene(),camera=new THREE.Camera(),quad=new THREE.Mesh(geometry,material);
  quad.frustumCulled=false;scene.add(quad);
  const clearColor=new THREE.Color();
  let disposed=false,maskTexture=null,lastMask=null,previousTime=null,surfaceTime=0;
  return {
    get texture(){return target.texture;},
    get size(){return target.width;},
    render(mask,time,{pressure=0,size:requestedSize=mask.width}={}){
      if(disposed||renderer.getContext().isContextLost())return false;
      const dimension=logoSurfaceSize(requestedSize);
      target.setSize(dimension,dimension);
      if(lastMask!==mask){
        maskTexture?.dispose();maskTexture=new THREE.CanvasTexture(mask);
        // Match the raw renderer's default unpack orientation; the licensed
        // shader itself flips logoUV. The render target already uses GL's
        // bottom-left origin, matching the former flipped CanvasTexture map.
        maskTexture.flipY=false;maskTexture.generateMipmaps=false;
        maskTexture.minFilter=maskTexture.magFilter=THREE.LinearFilter;
        uniforms.u_logoTexture.value=maskTexture;lastMask=mask;
      }
      const parameters=logoPressure(pressure),elapsed=Number.isFinite(time)?time:previousTime??0;
      if(previousTime===null||elapsed<previousTime)surfaceTime=elapsed*parameters.speed;
      else surfaceTime+=(elapsed-previousTime)*parameters.speed;
      previousTime=elapsed;
      for(const [key,value] of Object.entries(parameters))uniforms[`u_${key}`].value=value;
      uniforms.u_resolution.value.set(dimension,dimension);uniforms.u_time.value=surfaceTime/parameters.speed;
      const previousTarget=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
      const autoClear=renderer.autoClear,xr=renderer.xr.enabled,alpha=renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      try{
        renderer.autoClear=false;renderer.xr.enabled=false;
        // setRenderTarget applies this target's full viewport and disables its
        // scissor without changing the renderer's saved screen rectangles.
        renderer.setRenderTarget(target);renderer.setClearColor(0x000000,0);
        renderer.clear(true,false,false);renderer.render(scene,camera);
        return true;
      }finally{
        renderer.setRenderTarget(previousTarget,face,mip);
        renderer.setClearColor(clearColor,alpha);renderer.autoClear=autoClear;renderer.xr.enabled=xr;
      }
    },
    dispose(){
      if(disposed)return;disposed=true;
      target.dispose();geometry.dispose();material.dispose();maskTexture?.dispose();scene.clear();
    }
  };
}
