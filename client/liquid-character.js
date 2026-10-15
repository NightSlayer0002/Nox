import * as THREE from 'three';
import {createLiquidGeometry} from './liquid-geometry.js';
import {createNoxBodyResource} from './nox-body.js';
import {createBodyMotion} from './nox-body-motion.js';
import {appearancePose,appearanceProfile} from './nox-appearance.js';
import {drawEyes,drawMouth} from '../public/js/face-art.js';
import {createLiquidLogoRenderer} from '../public/js/source-effects.js';
import {LIQUID_FRAME_SIZE} from '../public/js/liquid-frame.js';

export function liquidRotation(face){
  // Screen Y grows down. Positive Three X turns the front normal downward.
  return face.reduceMotion?[0,0,0]:[face.gazeY/12*.1,face.gazeX/18*.22,0];
}

// One Three renderer and authored body across appearances. Stage owns time.
// Chrome is optional: ordinary NOX can render before it loads, or if it fails.
export async function createLiquidCharacter({appearance='liquid'}={}){
  let renderer,geometry,bodyResource,normalMaterial,metalMaterial,faceGeometry,faceMaterial,faceTexture,shadowMaterial;
  let chrome,surfaceTexture,environment,pmrem,reflectionTexture,chromeLoading,chromeFailed=false;
  let disposed=false,lost=false,api;
  const releaseChrome=()=>{
    if(chrome){chrome.onRestore=null;chrome.dispose();chrome=null;}
    metalMaterial?.dispose();metalMaterial=null;surfaceTexture?.dispose();surfaceTexture=null;
    environment?.dispose();environment=null;pmrem?.dispose();pmrem=null;reflectionTexture?.dispose();reflectionTexture=null;
  };
  try{
    const canvas=document.createElement('canvas');
    renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
    // Three reports compile errors through this hook instead of throwing by
    // default. Surface failure can then recover to the ordinary material.
    renderer.debug.onShaderError=()=>{throw Error('NOX material shader unavailable');};
    renderer.setPixelRatio(1);renderer.setSize(512,512,false);renderer.setClearColor(0,0);
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
    const half=LIQUID_FRAME_SIZE/2,scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-half,half,half,-half,.1,2000);camera.position.z=600;
    const group=new THREE.Group();scene.add(group);
    geometry=createLiquidGeometry();
    normalMaterial=new THREE.MeshPhysicalMaterial(appearanceProfile('face').material);
    // A quiet mint edge brings out the authored round volume on the dark stage.
    normalMaterial.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nfloat noxRim = pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 3.2);\ntotalEmissiveRadiance += vec3(0.22, 0.34, 0.27) * noxRim * 0.32;');
    };
    normalMaterial.customProgramCacheKey=()=> 'nox-soft-volume-v1';
    const wave={value:0},bodyMesh=new THREE.Mesh(geometry,normalMaterial);group.add(bodyMesh);
    canvas.dataset.bodySource='procedural';
    bodyResource=createNoxBodyResource({fallbackGeometry:geometry,onChange:body=>{
      geometry=body.geometry;bodyMesh.geometry=geometry;bodyMesh.updateMorphTargets();bodyMesh.morphTargetDictionary=body.morphTargets;
      canvas.dataset.bodySource=body.source;canvas.dataset.bodyTriangles=String(geometry.index.count/3);
    }});
    const bodyMotion=createBodyMotion();let previousBodyFrame;
    const faceCanvas=document.createElement('canvas');faceCanvas.width=faceCanvas.height=512;const ctx=faceCanvas.getContext('2d');
    faceTexture=new THREE.CanvasTexture(faceCanvas);faceTexture.colorSpace=THREE.SRGBColorSpace;faceTexture.generateMipmaps=false;faceTexture.minFilter=THREE.LinearFilter;
    faceGeometry=new THREE.PlaneGeometry(LIQUID_FRAME_SIZE,LIQUID_FRAME_SIZE);
    faceMaterial=new THREE.MeshBasicMaterial({map:faceTexture,transparent:true,depthWrite:false,toneMapped:false});
    const faceMesh=new THREE.Mesh(faceGeometry,faceMaterial);faceMesh.position.z=108;group.add(faceMesh);
    // Share the face plane; analytic alpha avoids a new geometry or image asset.
    shadowMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{opacity:{value:.22}},vertexShader:'varying vec2 noxUv; void main(){noxUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec2 noxUv; uniform float opacity; void main(){vec2 p=(noxUv-.5)*2.0;float a=exp(-dot(p,p)*4.2)*(1.0-smoothstep(.65,1.0,length(p)));gl_FragColor=vec4(.04,.08,.06,a*opacity);}' });
    const shadow=new THREE.Mesh(faceGeometry,shadowMaterial);shadow.position.set(0,-149,-120);shadow.scale.set(.72,.115,1);scene.add(shadow);
    const hemisphere=new THREE.HemisphereLight('#f4f7f3','#344645',.9);scene.add(hemisphere);
    const lights=[];
    for(const [color,position] of [['#f8f1df',[240,250,400]],['#9bdcd5',[-220,50,250]],['#d8f2df',[0,80,-260]]]){
      const light=new THREE.DirectionalLight(color,1);light.position.set(...position);scene.add(light);lights.push(light);
    }
    const mask=document.createElement('canvas');mask.width=mask.height=512;const maskCtx=mask.getContext('2d');maskCtx.fillStyle='#fff';maskCtx.fillRect(0,0,512,512);
    const restore=()=>{if(!disposed){lost=false;api.onRestore?.();}};
    const lose=event=>{event.preventDefault();lost=true;};
    canvas.addEventListener('webglcontextlost',lose);canvas.addEventListener('webglcontextrestored',restore);
    const prepareChrome=()=>{
      if(disposed||chrome||chromeLoading||chromeFailed)return;
      canvas.dataset.chrome='loading';
      chromeLoading=Promise.resolve().then(()=>disposed?null:createLiquidLogoRenderer()).then(result=>{
        if(!result)return;
        if(disposed){result.dispose();return;}
        chrome=result;chrome.onRestore=restore;
        if(!chrome.render(mask,2))throw Error('Chrome surface unavailable');
        surfaceTexture=new THREE.CanvasTexture(chrome.canvas);surfaceTexture.colorSpace=THREE.SRGBColorSpace;surfaceTexture.generateMipmaps=false;surfaceTexture.minFilter=surfaceTexture.magFilter=THREE.LinearFilter;
        const reflection=document.createElement('canvas');reflection.width=256;reflection.height=128;reflection.getContext('2d').drawImage(chrome.canvas,0,0,256,128);
        reflectionTexture=new THREE.CanvasTexture(reflection);reflectionTexture.colorSpace=THREE.SRGBColorSpace;reflectionTexture.mapping=THREE.EquirectangularReflectionMapping;
        pmrem=new THREE.PMREMGenerator(renderer);environment=pmrem.fromEquirectangular(reflectionTexture);
        metalMaterial=new THREE.MeshPhysicalMaterial({...appearanceProfile('liquid').material,map:surfaceTexture,envMap:environment.texture,envMapIntensity:1.15});
        metalMaterial.onBeforeCompile=shader=>{shader.uniforms.noxTime=wave;shader.vertexShader='uniform float noxTime;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.z += sin((position.x / 100.0 + noxTime) * 4.0) * 2.0;');};
        metalMaterial.customProgramCacheKey=()=> 'nox-r3f-source-wave-v1';
        canvas.dataset.chrome='ready';
      }).catch(()=>{if(!disposed){releaseChrome();chromeFailed=true;canvas.dataset.chrome='fallback';}}).finally(()=>{chromeLoading=null;});
    };
    api={canvas,kind:'3d',onRestore:null,render(face,time,appearance='liquid'){
      if(disposed||lost||renderer.getContext().isContextLost())return false;
      const wantsChrome=appearanceProfile(appearance).chrome;
      if(wantsChrome)prepareChrome();
      let metal=wantsChrome&&Boolean(metalMaterial);
      if(metal){
        try{if(!chrome.render(mask,time+2))metal=false;else surfaceTexture.needsUpdate=true;}
        catch{metal=false;chromeFailed=true;canvas.dataset.chrome='fallback';releaseChrome();}
      }
      const activeAppearance=metal?'liquid':'face',profile=appearanceProfile(activeAppearance);
      bodyMesh.material=metal?metalMaterial:normalMaterial;
      renderer.toneMappingExposure=profile.exposure;hemisphere.intensity=profile.lights[0];
      lights.forEach((light,index)=>{light.intensity=profile.lights[index+1];});
      lights[2].color.set(metal?'#ffffff':'#d8f2df');lights[2].position.set(0,metal?-200:80,metal?-200:-260);
      shadow.visible=!metal;
      wave.value=face.reduceMotion?0:time*.22;
      const weights=bodyMotion.sample(face,time),pose=appearancePose(activeAppearance,weights,face.reduceMotion);
      group.rotation.set(...liquidRotation(face));group.rotation.z+=pose.rotation;group.scale.set(...pose.scale);
      canvas.dataset.bodyFrameDelta=previousBodyFrame===undefined?'0':(time-previousBodyFrame).toFixed(3);previousBodyFrame=time;
      for(const [name,index] of Object.entries(bodyResource.morphTargets))bodyMesh.morphTargetInfluences[index]=pose.morphs[name]||0;
      canvas.dataset.bodyHold=weights.Hold.toFixed(3);canvas.dataset.bodyWobble=Math.max(weights.WobbleLeft,weights.WobbleRight).toFixed(3);canvas.dataset.bodyImpact=weights.Impact.toFixed(3);
      canvas.dataset.appearance=activeAppearance;
      const features=face.features(time),red=face.mode==='uncanny'||face.emotion==='uncanny';
      const color=red?'#efbba3':face.mode==='director'?'#eeefd6':'#fff3c9';
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,512,512);ctx.translate(256,256);ctx.scale(512/LIQUID_FRAME_SIZE,512/LIQUID_FRAME_SIZE);
      ctx.shadowColor=red?'#c78361':'#f2d794';ctx.shadowBlur=metal?5:9;
      drawEyes(ctx,features,face.gazeX,face.gazeY,time,color,face.reduceMotion);ctx.shadowBlur=metal?2:3;
      drawMouth(ctx,features,face.gazeX,face.gazeY,color);faceTexture.needsUpdate=true;
      try{renderer.render(scene,camera);}
      catch{
        if(!metal)return false;
        chromeFailed=true;canvas.dataset.chrome='fallback';releaseChrome();bodyMesh.material=normalMaterial;
        const fallback=appearanceProfile('face');renderer.toneMappingExposure=fallback.exposure;hemisphere.intensity=fallback.lights[0];
        lights.forEach((light,index)=>{light.intensity=fallback.lights[index+1];});
        lights[2].color.set('#d8f2df');lights[2].position.set(0,80,-260);shadow.visible=true;canvas.dataset.appearance='face';
        try{renderer.render(scene,camera);}catch{return false;}
      }
      canvas.dataset.geometry='rounded-blob-volume';return true;
    },dispose(){
      if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',lose);canvas.removeEventListener('webglcontextrestored',restore);
      releaseChrome();bodyResource.dispose();normalMaterial.dispose();faceGeometry.dispose();faceMaterial.dispose();faceTexture.dispose();shadowMaterial.dispose();renderer.dispose();renderer.forceContextLoss();
    }};
    if(appearanceProfile(appearance).chrome)prepareChrome();
    return api;
  }catch(error){
    disposed=true;releaseChrome();if(bodyResource)bodyResource.dispose();else geometry?.dispose();
    normalMaterial?.dispose();faceGeometry?.dispose();faceMaterial?.dispose();faceTexture?.dispose();shadowMaterial?.dispose();renderer?.dispose();renderer?.forceContextLoss();throw error;
  }
}
