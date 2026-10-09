// Adaptation of pmndrs/react-three-fiber example demos/Gestures.tsx,
// Gltf.tsx and SVGRenderer.tsx. Geometry comes only from the existing icon.svg;
// liquid-logo's original Chrome shader supplies the animated metal surface.
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {useSpring} from '@react-spring/web';
import * as THREE from 'three';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import {SourceBoundary} from './source-boundary.jsx';
import {createLogoReadiness} from '/js/logo-interaction.js';
import {emblemPointer} from '/js/home-choreography.js';
import {createFrameBudget,createLiquidLogoRenderer} from '/js/source-effects.js';

const fallback=<div className="logo-static"><img src="/icon.svg" alt=""/></div>;

function LogoModel({pose,matter,pointer,rotation,spring,onStatus}){
  const outer=useRef(),inner=useRef(),meshes=useRef([]),resources=useRef({}),readiness=useRef(),due=useRef(createFrameBudget(30)),lastPointer=useRef({x:0,y:0}),pressureState=useRef(0);
  const {gl,viewport,setFrameloop,invalidate}=useThree(),[parts,setParts]=useState([]);
  const wave=useMemo(()=>({time:{value:0},pressure:{value:0}}),[]);
  const front=useMemo(()=>new THREE.MeshBasicMaterial({color:'#c1ceca',toneMapped:false,transparent:true}),[]);
  const side=useMemo(()=>new THREE.MeshStandardMaterial({color:'#397d78',metalness:.65,roughness:.24,transparent:true}),[]);
  useEffect(()=>{
    // Original R3F ShaderMaterial demo wave, applied to existing icon geometry.
    for(const material of [front,side]){material.onBeforeCompile=shader=>{shader.uniforms.noxTime=wave.time;shader.uniforms.noxPressure=wave.pressure;shader.vertexShader='uniform float noxTime;\nuniform float noxPressure;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.z += sin((position.x / 8.0 + noxTime) * 4.0) * noxPressure * 0.8;');};material.customProgramCacheKey=()=> 'nox-emblem-source-wave-v1';}
  },[front,side,wave]);
  useEffect(()=>{
    let live=true,visible=true,lost=false;const abort=new AbortController(),owned=[];let renderer,texture,geometryReady=false;
    const state=createLogoReadiness(onStatus);readiness.current=state;
    const visibility=()=>{setFrameloop(document.hidden||!visible||lost?'never':'always');if(!document.hidden&&visible&&!lost)invalidate();};
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;visibility();});observer.observe(gl.domElement);document.addEventListener('visibilitychange',visibility);visibility();
    const lose=event=>{event.preventDefault();lost=true;visibility();state.lose();},restore=()=>{lost=false;visibility();state.restore();};gl.domElement.addEventListener('webglcontextlost',lose);gl.domElement.addEventListener('webglcontextrestored',restore);
    async function build(){
      const response=await fetch('/icon.svg',{signal:abort.signal});if(!response.ok)throw Error('NOX icon unavailable');
      const svg=new SVGLoader().parse(await response.text());if(!live)return;
      const eyes=svg.paths.filter(path=>path.userData.style.fill==='#eee8cc');
      for(const path of eyes){for(const shape of path.toShapes()){
        const geometry=new THREE.ExtrudeGeometry(shape,{depth:4,steps:1,bevelEnabled:true,bevelThickness:.8,bevelSize:.7,bevelSegments:3,curveSegments:20});
        geometry.computeBoundingBox();const {min,max}=geometry.boundingBox;
        const uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)-min.x)/(max.x-min.x),(uv.getY(i)-min.y)/(max.y-min.y));
        owned.push(geometry);
      }}
      const mouth=svg.paths.find(path=>path.userData.style.stroke==='#eee8cc');
      if(mouth){const points=mouth.subPaths[0].getPoints(48).map(p=>new THREE.Vector3(p.x,p.y,2));owned.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),48,1,8,false));}
      if(owned.length<3)throw Error('NOX icon could not be adapted');
      setParts([...owned]);geometryReady=true;state.setPhase('solid');
      const mask=document.createElement('canvas');mask.width=mask.height=512;const ctx=mask.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,512,512);
      const loadMetal=async()=>{
        const next=await createLiquidLogoRenderer();if(!live){next.dispose();return;}
        renderer?.dispose();texture?.dispose();renderer=next;texture=new THREE.CanvasTexture(renderer.canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;
        front.map=texture;front.needsUpdate=true;resources.current={renderer,texture,mask,started:performance.now()};
        renderer.onRestore=()=>{loadMetal().catch(()=>{if(live)state.setPhase('solid');});};state.setPhase('metal');
      };
      await loadMetal();
    }
    build().catch(error=>{if(live&&error.name!=='AbortError')state.setPhase(geometryReady?'solid':'fallback');});
    return()=>{live=false;abort.abort();observer.disconnect();document.removeEventListener('visibilitychange',visibility);gl.domElement.removeEventListener('webglcontextlost',lose);gl.domElement.removeEventListener('webglcontextrestored',restore);renderer?.dispose();texture?.dispose();front.dispose();side.dispose();for(const geometry of owned)geometry.dispose();resources.current={};readiness.current=null;};
  },[gl,setFrameloop,invalidate,front,side,onStatus]);
  useFrame(({gl,scene,camera})=>{
    const now=performance.now();if(!due.current(now)||!parts.length)return;
    pressureState.current+=(matter.hold-pressureState.current)*.28;
    const pressure=pressureState.current,attention=emblemPointer(pointer.current,pose);
    if(Math.abs(attention.x-lastPointer.current.x)+Math.abs(attention.y-lastPointer.current.y)>.002){lastPointer.current=attention;spring.start(attention);}
    outer.current.rotation.set(pose.x,pose.y,pose.z);outer.current.position.set((pose.screenX-.5)*viewport.width,(.5-pose.screenY)*viewport.height,0);outer.current.scale.setScalar(pose.size*viewport.width/3.2);
    inner.current.rotation.set(rotation.x.get(),rotation.y.get(),0);inner.current.scale.set(1+pressure*.12,1-pressure*.12,1+pressure*.2);
    for(let i=0;i<meshes.current.length;i++){const mesh=meshes.current[i];if(mesh){mesh.position.x=i<2?(i===0?-1:1)*(pose.spread*3+pressure*4):0;mesh.position.y=i===2?pose.spread*2+pressure*3:0;}}
    front.opacity=side.opacity=pose.opacity;wave.time.value=now/4000;wave.pressure.value=pressure+(matter.metal ? .25 : 0);
    const active=resources.current;if(active.renderer){const available=active.renderer.render(active.mask,(now-active.started)/1000,{pressure});if(available){active.texture.needsUpdate=true;}else if(front.map){front.map=null;front.needsUpdate=true;readiness.current?.setPhase('solid');}}
    gl.render(scene,camera);gl.domElement.dataset.source='r3f-liquid-logo';gl.domElement.dataset.geometry='nox-icon-extrusion';gl.domElement.dataset.screenX=pose.screenX.toFixed(3);gl.domElement.dataset.screenY=pose.screenY.toFixed(3);gl.domElement.dataset.tiltY=inner.current.rotation.y.toFixed(3);gl.domElement.dataset.scrollY=outer.current.rotation.y.toFixed(3);gl.domElement.dataset.pressure=pressure.toFixed(3);gl.domElement.dataset.frame=String(Math.round(now/34));
  },1);
  return <group ref={outer}><group ref={inner}><group scale={[.08,-.08,.08]} position={[-2.56,2.65,0]} dispose={null}>{parts.map((geometry,index)=><mesh ref={mesh=>{meshes.current[index]=mesh;}} key={index} geometry={geometry} material={index<2?[front,side]:front}/>)}</group></group></group>;
}

export default function SourceLogo({pose,matter}){
  const pointer=useRef(null);
  const [status,setStatus]=useState('loading'),[{x,y},spring]=useSpring(()=>({x:0,y:0,config:{mass:1.3,tension:90,friction:24}}));
  const changeStatus=useCallback(value=>setStatus(value),[]);
  useEffect(()=>{const move=event=>{if(event.pointerType!=='touch')pointer.current={x:event.clientX/innerWidth,y:event.clientY/innerHeight};},blur=()=>{pointer.current=null;spring.start({x:0,y:0});};document.addEventListener('pointermove',move,{passive:true});window.addEventListener('blur',blur);return()=>{document.removeEventListener('pointermove',move);window.removeEventListener('blur',blur);};},[spring]);
  return <div className="source-logo" data-state={status}>
    <div className="logo-canvas" aria-hidden="true">
      <div className="logo-loading" hidden={status!=='loading'}>{fallback}</div>
      <SourceBoundary fallback={fallback}><Canvas dpr={1} gl={{alpha:true,antialias:true,powerPreference:'low-power'}} camera={{position:[0,0,7],fov:34}} fallback={fallback} style={{pointerEvents:'none'}}><ambientLight intensity={.5*Math.PI}/><spotLight decay={0} position={[10,10,10]} angle={.3} penumbra={1}/><pointLight decay={0} position={[-10,-10,-10]}/><LogoModel pose={pose} matter={matter} pointer={pointer} rotation={{x,y}} spring={spring} onStatus={changeStatus}/></Canvas></SourceBoundary>
    </div>
    {status==='fallback'&&<div className="logo-fallback">{fallback}</div>}
  </div>;
}
