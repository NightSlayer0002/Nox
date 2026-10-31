import React,{useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createEmblemFollowers,FOLLOWER_TRAIL_POINTS as trailPoints} from '../public/js/emblem-followers.js';
import {readMotionPreference} from '../public/js/preferences.js';

// Three small dimensional heads, rendered in the emblem's existing context.
// Trails record their actual flight; they are soft ribbons, not fixed orbits.
export function EmblemFollowers({pose,matter}){
  const heads=useRef([]),eyes=useRef([]),halos=useRef([]),reduceMotion=useRef(!readMotionPreference()),flight=useMemo(()=>createEmblemFollowers(),[]);
  const {viewport,size,gl,camera}=useThree();
  const assets=useMemo(()=>{
    const body=new RoundedBoxGeometry(1.28,.96,.4,3,.16);
    const plate=new RoundedBoxGeometry(1.04,.72,.1,3,.13);
    const eye=new THREE.CapsuleGeometry(.058,.19,3,8);
    const halo=new THREE.PlaneGeometry(.3,.45);
    const glow=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uOpacity:{value:1}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 vUv;uniform float uOpacity;void main(){float d=length((vUv-.5)*2.);gl_FragColor=vec4(.67,.95,.88,pow(max(0.,1.-d),2.)*.35*uOpacity);}`});
    const fin=new THREE.BoxGeometry(.14,.28,.22);
    const mouth=new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-.1,-.19,.3),new THREE.Vector3(0,-.24,.3),new THREE.Vector3(.1,-.19,.3)]),8,.018,5,false);
    const hull=new THREE.MeshStandardMaterial({color:'#48776f',metalness:.7,roughness:.32,transparent:true});
    const face=new THREE.MeshStandardMaterial({color:'#0b181b',metalness:.35,roughness:.5,transparent:true});
    const light=new THREE.MeshBasicMaterial({color:'#d8f3e9',transparent:true,toneMapped:false});
    const trailMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uOpacity:{value:1}},
      vertexShader:`attribute float aAcross; attribute float aAge; varying float vAcross; varying float vAge;
        void main(){vAcross=aAcross;vAge=aAge;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform float uOpacity; varying float vAcross; varying float vAge;
        void main(){float edge=pow(max(0.,1.-abs(vAcross)),1.4);gl_FragColor=vec4(.57,.79,.75,edge*vAge*vAge*.36*uOpacity);}`});
    const trails=Array.from({length:3},()=>{
      const g=new THREE.BufferGeometry(),across=[],ages=[],index=[];
      for(let i=0;i<trailPoints;i++){across.push(-1,1);ages.push(1-i/(trailPoints-1),1-i/(trailPoints-1));if(i<trailPoints-1){const n=i*2;index.push(n,n+1,n+2,n+1,n+3,n+2);}}
      g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(trailPoints*6),3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aAcross',new THREE.Float32BufferAttribute(across,1));g.setAttribute('aAge',new THREE.Float32BufferAttribute(ages,1));g.setIndex(index);return g;
    });
    return {body,plate,eye,halo,glow,fin,mouth,hull,face,light,trailMaterial,trails};
  },[]);
  useEffect(()=>{
    return()=>{for(const value of Object.values(assets))if(Array.isArray(value))value.forEach(g=>g.dispose());else value.dispose();};
  },[assets]);
  useFrame((_,delta)=>{
    const time=performance.now()/1000;
    const state=flight.update({pose,width:size.width,height:size.height,time,delta,reduceMotion:reduceMotion.current});
    const pixel=viewport.width/size.width,unit=pixel*(size.width<=700?19:24);
    for(let i=0;i<state.agents.length;i++){
      const a=state.agents[i],head=heads.current[i],vertices=assets.trails[i].attributes.position;
      const headZ=.8+a.depth,perspective=(camera.position.z-headZ)/camera.position.z;
      head.position.set((a.x-size.width/2)*pixel*perspective,(size.height/2-a.y)*pixel*perspective,headZ);
      head.rotation.set(.06,-a.angle*.7,-a.angle);head.scale.setScalar(unit*perspective*(1+i*.06));
      const blink=reduceMotion.current?1:((time+i*1.7)%5.8<.13?.12:1);
      for(const eye of eyes.current[i]||[])eye.scale.y=blink;
      for(const halo of halos.current[i]||[])halo.scale.y=blink;
      for(let j=0;j<trailPoints;j++){
        const p=j*3,next=Math.min(trailPoints-1,j+1)*3,previous=Math.max(0,j-1)*3;
        const dx=a.trail[next]-a.trail[previous],dy=a.trail[next+1]-a.trail[previous+1],length=Math.hypot(dx,dy)||1;
        const half=2.4*(1-j/trailPoints),ox=-dy/length*half,oy=dx/length*half;
        const z=.77+a.trail[p+2],perspective=(camera.position.z-z)/camera.position.z;
        for(let side=0;side<2;side++){const sign=side?1:-1;vertices.setXYZ(j*2+side,(a.trail[p]+ox*sign-size.width/2)*pixel*perspective,(size.height/2-a.trail[p+1]-oy*sign)*pixel*perspective,z);}
      }
      vertices.needsUpdate=true;assets.trails[i].setDrawRange(0,Math.max(0,a.trailCount-1)*6);
    }
    assets.hull.metalness=matter?.metal?.88:.7;assets.hull.roughness=matter?.metal?.22:.32;
    assets.hull.opacity=assets.face.opacity=state.opacity*.92;assets.light.opacity=state.opacity;assets.glow.uniforms.uOpacity.value=state.opacity;assets.trailMaterial.uniforms.uOpacity.value=state.opacity;
    gl.domElement.dataset.followers='3';gl.domElement.dataset.followerMotion=reduceMotion.current?'direct':'emblem-orbit';
    gl.domElement.dataset.followerX=state.agents.map(a=>Math.round(a.x)).join(',');
  });
  return <group dispose={null}>{[0,1,2].map(i=><React.Fragment key={i}>
    <mesh geometry={assets.trails[i]} material={assets.trailMaterial} frustumCulled={false}/>
    <group ref={node=>{heads.current[i]=node;}}>
      <mesh geometry={assets.body} material={assets.hull}/><mesh position={[0,0,.22]} geometry={assets.plate} material={assets.face}/>
      <mesh position={[-.71,0,0]} geometry={assets.fin} material={assets.hull}/><mesh position={[.71,0,0]} geometry={assets.fin} material={assets.hull}/>
      {[-.23,.23].map((x,n)=><mesh key={x} ref={node=>{(eyes.current[i]||=[])[n]=node;}} position={[x,.07,.3]} geometry={assets.eye} material={assets.light}/>)}
      {[-.23,.23].map((x,n)=><mesh key={`halo-${n}`} ref={node=>{(halos.current[i]||=[])[n]=node;}} position={[x,.07,.305]} geometry={assets.halo} material={assets.glow}/>)}
      <mesh geometry={assets.mouth} material={assets.light}/>
    </group>
  </React.Fragment>)}</group>;
}
