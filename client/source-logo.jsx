// Adaptation of pmndrs/react-three-fiber example demos/Gestures.tsx,
// Gltf.tsx and SVGRenderer.tsx. Geometry comes only from the existing icon.svg;
// liquid-logo's original Chrome shader supplies the animated metal surface.
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {useSpring} from '@react-spring/web';
import * as THREE from 'three';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import {SourceBoundary} from './source-boundary.jsx';
import {createLogoGesture,createLogoReadiness} from '/js/logo-interaction.js';
import {createFrameBudget,createLiquidLogoRenderer} from '/js/source-effects.js';

const clamp=value=>Math.max(-1,Math.min(1,value));
const fallback=<div className="logo-static"><img src="/icon.svg" alt=""/><span>NOX emblem / static preview</span></div>;

function LogoModel({pose,rotation,onStatus}){
  const outer=useRef(),inner=useRef(),resources=useRef({}),readiness=useRef(),due=useRef(createFrameBudget(30));
  const {gl,setFrameloop,invalidate}=useThree(),[parts,setParts]=useState([]);
  const front=useMemo(()=>new THREE.MeshBasicMaterial({color:'#d6f0ea',toneMapped:false}),[]);
  const side=useMemo(()=>new THREE.MeshStandardMaterial({color:'#397d78',metalness:.55,roughness:.24}),[]);
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
    outer.current.rotation.set(pose.x,pose.y,pose.z);inner.current.rotation.set(rotation.x.get(),rotation.y.get(),0);
    const active=resources.current;if(active.renderer){const available=active.renderer.render(active.mask,(now-active.started)/1000);if(available){active.texture.needsUpdate=true;}else if(front.map){front.map=null;front.needsUpdate=true;readiness.current?.setPhase('solid');}}
    gl.render(scene,camera);gl.domElement.dataset.source='r3f-liquid-logo';gl.domElement.dataset.geometry='nox-icon-extrusion';gl.domElement.dataset.tiltY=inner.current.rotation.y.toFixed(3);gl.domElement.dataset.scrollY=outer.current.rotation.y.toFixed(3);gl.domElement.dataset.frame=String(Math.round(now/34));
  },1);
  return <group ref={outer}><group ref={inner}><group scale={[.08,-.08,.08]} position={[-2.56,2.65,0]} dispose={null}>{parts.map((geometry,index)=><mesh key={index} geometry={geometry} material={index<2?[front,side]:front}/>)}</group></group></group>;
}

export default function SourceLogo({pose}){
  const surface=useRef(),capture=useRef(null),gesture=useRef(createLogoGesture());
  const [status,setStatus]=useState('loading'),[{x,y},spring]=useSpring(()=>({x:0,y:0,config:{mass:1.3,tension:90,friction:24}}));
  const changeStatus=useCallback(value=>setStatus(value),[]);
  const settle=()=>spring.start(gesture.current.angles);
  const release=event=>{if(!gesture.current.end(event.pointerId))return;capture.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);settle();};
  const reset=()=>{const id=capture.current;gesture.current.reset();capture.current=null;if(id!==null&&surface.current?.hasPointerCapture(id))surface.current.releasePointerCapture(id);settle();};
  useEffect(()=>{const blur=()=>{const id=capture.current;if(id!==null){gesture.current.end(id);capture.current=null;if(surface.current?.hasPointerCapture(id))surface.current.releasePointerCapture(id);settle();}};window.addEventListener('blur',blur);return()=>window.removeEventListener('blur',blur);},[]);
  return <div className="source-logo" data-state={status}>
    <div className="logo-canvas" ref={surface} aria-hidden="true" onPointerDown={event=>{if(event.button===0&&event.isPrimary&&gesture.current.begin(event.pointerId,event.clientX,event.clientY)){event.currentTarget.setPointerCapture(event.pointerId);capture.current=event.pointerId;}}} onPointerMove={event=>{if(gesture.current.active){if(gesture.current.move(event.pointerId,event.clientX,event.clientY))settle();}else if(event.pointerType!=='touch'){const rect=event.currentTarget.getBoundingClientRect(),base=gesture.current.angles;spring.start({x:base.x+clamp((event.clientY-rect.top)/rect.height-.5)*.12,y:base.y+clamp((event.clientX-rect.left)/rect.width-.5)*.2});}}} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onPointerLeave={()=>{if(!gesture.current.active)settle();}}>
      <div className="logo-loading" hidden={status!=='loading'}>{fallback}</div>
      <SourceBoundary fallback={fallback}><Canvas dpr={1} gl={{alpha:true,antialias:true,powerPreference:'low-power'}} camera={{position:[0,0,7],fov:34}} fallback={fallback} style={{touchAction:'pan-y'}}><ambientLight intensity={.5*Math.PI}/><spotLight decay={0} position={[10,10,10]} angle={.3} penumbra={1}/><pointLight decay={0} position={[-10,-10,-10]}/><LogoModel pose={pose} rotation={{x,y}} onStatus={changeStatus}/></Canvas></SourceBoundary>
    </div>
    {status==='fallback'&&<div className="logo-fallback">{fallback}</div>}
    <div className="logo-controls"><span>LIVE METAL MARK / DRAG TO TURN</span><button onClick={()=>{if(gesture.current.turn(-.18))settle();}} aria-label="Turn emblem left">←</button><button onClick={()=>{if(gesture.current.turn(.18))settle();}} aria-label="Turn emblem right">→</button><button onClick={reset}>Reset view</button></div>
  </div>;
}
