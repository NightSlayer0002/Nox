import * as THREE from 'three';
import {createLiquidGeometry} from './liquid-geometry.js';
import {drawEyes,drawMouth} from '../public/js/face-art.js';
import {createLiquidLogoRenderer} from '../public/js/source-effects.js';
import {LIQUID_FRAME_SIZE} from '../public/js/liquid-frame.js';

// Three/R3F scene/material patterns, liquid-logo's original Chrome surface,
// and the existing NOX brand/acting. Stage is the only animation clock.
export async function createLiquidCharacter(){
  const chrome=await createLiquidLogoRenderer();
  let renderer,geometry,material,faceGeometry,faceMaterial,faceTexture,surfaceTexture,environment,pmrem,cube;
  try{
    const canvas=document.createElement('canvas');
    renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
    renderer.setPixelRatio(1);renderer.setSize(512,512,false);renderer.setClearColor(0,0);
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
    const half=LIQUID_FRAME_SIZE/2,scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-half,half,half,-half,.1,2000);camera.position.z=600;
    const group=new THREE.Group();scene.add(group);
    const mask=document.createElement('canvas');mask.width=mask.height=512;const maskCtx=mask.getContext('2d');maskCtx.fillStyle='#fff';maskCtx.fillRect(0,0,512,512);chrome.render(mask,2);
    surfaceTexture=new THREE.CanvasTexture(chrome.canvas);surfaceTexture.colorSpace=THREE.SRGBColorSpace;surfaceTexture.generateMipmaps=false;surfaceTexture.minFilter=surfaceTexture.magFilter=THREE.LinearFilter;
    const reflection=document.createElement('canvas');reflection.width=reflection.height=128;reflection.getContext('2d').drawImage(chrome.canvas,0,0,128,128);
    cube=new THREE.CubeTexture(Array(6).fill(reflection));cube.colorSpace=THREE.SRGBColorSpace;cube.needsUpdate=true;
    pmrem=new THREE.PMREMGenerator(renderer);environment=pmrem.fromCubemap(cube);
    geometry=createLiquidGeometry();
    material=new THREE.MeshPhysicalMaterial({color:'#dce5e3',metalness:.94,roughness:.17,clearcoat:1,clearcoatRoughness:.12,map:surfaceTexture,envMap:environment.texture,envMapIntensity:1.5});
    const wave={value:0};
    // Vertex wave from R3F's ShaderMaterial.tsx demo, adapted from 2-unit
    // demo coordinates to the existing 290-unit NOX outline (2px amplitude).
    material.onBeforeCompile=shader=>{shader.uniforms.noxTime=wave;shader.vertexShader='uniform float noxTime;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.z += sin((position.x / 100.0 + noxTime) * 4.0) * 2.0;');};
    material.customProgramCacheKey=()=> 'nox-r3f-source-wave-v1';group.add(new THREE.Mesh(geometry,material));
    const faceCanvas=document.createElement('canvas');faceCanvas.width=faceCanvas.height=512;const ctx=faceCanvas.getContext('2d');
    faceTexture=new THREE.CanvasTexture(faceCanvas);faceTexture.colorSpace=THREE.SRGBColorSpace;faceTexture.generateMipmaps=false;faceTexture.minFilter=THREE.LinearFilter;
    faceGeometry=new THREE.PlaneGeometry(LIQUID_FRAME_SIZE,LIQUID_FRAME_SIZE);faceMaterial=new THREE.MeshBasicMaterial({map:faceTexture,transparent:true,depthWrite:false,toneMapped:false});
    const faceMesh=new THREE.Mesh(faceGeometry,faceMaterial);faceMesh.position.z=108;group.add(faceMesh);
    scene.add(new THREE.HemisphereLight('#f4f7f3','#344645',2));
    for(const [color,intensity,position] of [['#f8f1df',4,[240,250,400]],['#9bdcd5',3,[-220,50,250]],['#fff',3,[0,-200,-200]]]){const light=new THREE.DirectionalLight(color,intensity);light.position.set(...position);scene.add(light);}
    let disposed=false,lost=false;
    const lose=event=>{event.preventDefault();lost=true;},restore=()=>api.onRestore?.();
    canvas.addEventListener('webglcontextlost',lose);canvas.addEventListener('webglcontextrestored',restore);chrome.onRestore=restore;
    const api={canvas,kind:'3d',onRestore:null,render(face,time){
      if(disposed||lost||renderer.getContext().isContextLost()||!chrome.render(mask,time+2))return false;
      surfaceTexture.needsUpdate=true;wave.value=face.reduceMotion?0:time*.22;
      group.rotation.set(face.reduceMotion?0:-face.gazeY/12*.1,face.reduceMotion?0:face.gazeX/18*.22,0);
      const features=face.features(time),red=face.mode==='uncanny'||face.emotion==='uncanny',color=red?'#efbba3':face.mode==='director'?'#eeefd6':'#fff3c9';
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,512,512);ctx.translate(256,256);ctx.scale(512/LIQUID_FRAME_SIZE,512/LIQUID_FRAME_SIZE);
      ctx.shadowColor=red?'#c78361':'#f2d794';ctx.shadowBlur=5;drawEyes(ctx,features,face.gazeX,face.gazeY,time,color,face.reduceMotion);ctx.shadowBlur=2;drawMouth(ctx,features,face.gazeX,face.gazeY,color);faceTexture.needsUpdate=true;
      renderer.render(scene,camera);canvas.dataset.geometry='rounded-blob-volume';return true;
    },dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',lose);canvas.removeEventListener('webglcontextrestored',restore);chrome.onRestore=null;chrome.dispose();geometry.dispose();material.dispose();faceGeometry.dispose();faceMaterial.dispose();faceTexture.dispose();surfaceTexture.dispose();environment.dispose();pmrem.dispose();cube.dispose();renderer.dispose();renderer.forceContextLoss();}};
    return api;
  }catch(error){chrome.dispose();geometry?.dispose();material?.dispose();faceGeometry?.dispose();faceMaterial?.dispose();faceTexture?.dispose();surfaceTexture?.dispose();environment?.dispose();pmrem?.dispose();cube?.dispose();renderer?.dispose();renderer?.forceContextLoss();throw error;}
}
