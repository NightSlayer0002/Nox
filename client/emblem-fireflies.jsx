import React,{useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {createEmblemFireflies} from '../public/js/emblem-fireflies.js';

// One point draw in the logo's existing WebGL context. Soft halos are analytic,
// so this needs no image, postprocessing pass, extra canvas or animation loop.
export function EmblemFireflies({pose}){
  const cloud=useRef(),reduceMotion=useRef(false),swarm=useMemo(()=>createEmblemFireflies(),[]);
  const {viewport,size,gl}=useThree();
  const {geometry,material}=useMemo(()=>{
    const geometry=new THREE.BufferGeometry();
    const positions=new THREE.BufferAttribute(new Float32Array(72),3).setUsage(THREE.DynamicDrawUsage);
    const glows=new THREE.BufferAttribute(new Float32Array(24),1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position',positions);geometry.setAttribute('aGlow',glows);
    geometry.setAttribute('aSeed',new THREE.BufferAttribute(Float32Array.from({length:24},(_,i)=>(i*.618034)%1),1));
    const material=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
      uniforms:{uOpacity:{value:1},uSize:{value:1}},
      vertexShader:`attribute float aGlow; attribute float aSeed;
        uniform float uSize; varying float vGlow; varying float vWarm;
        void main(){
          vGlow=aGlow; vWarm=step(.25,aSeed);
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
          gl_PointSize=(15.+aSeed*11.)*uSize;
        }`,
      fragmentShader:`uniform float uOpacity; varying float vGlow; varying float vWarm;
        void main(){
          float r=length(gl_PointCoord*2.-1.); if(r>1.) discard;
          float light=exp(-r*r*6.5)*.22+exp(-r*r*120.);
          vec3 color=mix(vec3(.55,.86,.73),vec3(1.,.93,.65),vWarm);
          gl_FragColor=vec4(color,light*vGlow*uOpacity);
        }`
    });
    return {geometry,material};
  },[]);
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)'),change=()=>{reduceMotion.current=media.matches;};
    change();media.addEventListener('change',change);
    return()=>{media.removeEventListener('change',change);geometry.dispose();material.dispose();};
  },[geometry,material]);
  useFrame((_,delta)=>{
    const frame=swarm.update({pose,width:viewport.width,height:viewport.height,time:performance.now()/1000,delta,reduceMotion:reduceMotion.current});
    geometry.attributes.position.array.set(frame.positions);geometry.attributes.position.needsUpdate=true;
    geometry.attributes.aGlow.array.set(frame.glows);geometry.attributes.aGlow.needsUpdate=true;
    geometry.setDrawRange(0,size.width<=700?16:24);
    cloud.current.position.set(frame.center.x,frame.center.y,0);
    cloud.current.rotation.set(pose.x,pose.y,pose.z);cloud.current.scale.setScalar(frame.scale);
    material.uniforms.uOpacity.value=frame.opacity;
    material.uniforms.uSize.value=Math.min(1.25,Math.max(.75,size.width/1280));
    gl.domElement.dataset.fireflies=String(size.width<=700?16:24);
    gl.domElement.dataset.fireflyX=frame.center.x.toFixed(3);
    gl.domElement.dataset.fireflyMotion=reduceMotion.current?'still':'drift';
  });
  return <points ref={cloud} geometry={geometry} material={material} frustumCulled={false} dispose={null}/>;
}
