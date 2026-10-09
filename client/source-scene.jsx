// Adapted from ruucm/shadergradient apps/examples/example-vite-react/src/App.tsx
// and packages/shadergradient/src/presets.ts (Mint). Renderer: pmndrs/R3F.
import React,{Component,useEffect,useRef,useState} from 'react';
import {ShaderGradient,ShaderGradientCanvas} from '@shadergradient/react';
import {useFrame,useThree} from '@react-three/fiber';
import {useSpring} from '@react-spring/web';
import {createFrameBudget} from '/js/source-effects.js';

class Boundary extends Component{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onError?.();}
  render(){return this.state.failed?<div className="source-fallback" aria-hidden="true"/>:this.props.children;}
}
function Budget({onCanvas,tilt,sculpture,pose}){
  const {gl,setFrameloop,invalidate}=useThree(),due=useRef(createFrameBudget(30));
  useEffect(()=>{
    onCanvas?.(gl.domElement);
    let visible=true;const visibility=()=>{setFrameloop(document.hidden||!visible?'never':'always');if(!document.hidden&&visible)invalidate();};
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;visibility();});observer.observe(gl.domElement);
    document.addEventListener('visibilitychange',visibility);visibility();
    return()=>{observer.disconnect();document.removeEventListener('visibilitychange',visibility);onCanvas?.(null);};
  },[gl,setFrameloop,invalidate,onCanvas]);
  useFrame(({gl,scene,camera,clock})=>{if(!due.current(performance.now()))return;const mesh=scene.getObjectByName('shadergradient-mesh');if(mesh){if(sculpture){mesh.rotation.x=tilt.rotateX.get()*Math.PI/180;mesh.rotation.y=tilt.rotateY.get()*Math.PI/180;gl.domElement.dataset.tiltY=mesh.rotation.y.toFixed(3);}else if(pose){mesh.rotation.z=pose.waterTurn;mesh.position.x=pose.waterX;gl.domElement.dataset.scrollTurn=pose.waterTurn.toFixed(3);}}gl.render(scene,camera);gl.domElement.dataset.source='shadergradient';gl.domElement.dataset.geometry=sculpture?'icosahedron':'water-plane';gl.domElement.dataset.frame=String(Math.round(clock.elapsedTime*30));},1);
  return null;
}
export default function SourceScene({onCanvas,interactive=false,className='',variant='water',pose}){
  const host=useRef(),[ready,setReady]=useState(false),[failed,setFailed]=useState(false);
  const [{rotateX,rotateY},spring]=useSpring(()=>({rotateX:0,rotateY:0,config:{mass:1.2,tension:90,friction:24}}));
  useEffect(()=>{const observer=new IntersectionObserver(entries=>{if(entries[0].isIntersecting){setReady(true);observer.disconnect();}},{rootMargin:'100px'});observer.observe(host.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{if(!interactive)return;const pointer=e=>{if(e.pointerType==='touch')return;const rect=host.current.getBoundingClientRect(),clamp=v=>Math.max(-1,Math.min(1,v));spring.start({rotateX:clamp(.5-(e.clientY-rect.top)/Math.max(1,rect.height))*12,rotateY:clamp((e.clientX-rect.left)/Math.max(1,rect.width)-.5)*20});};document.addEventListener('pointermove',pointer,{passive:true});return()=>document.removeEventListener('pointermove',pointer);},[interactive,spring]);
  const sculpture=variant==='sphere';
  return <div ref={host} className={`source-scene ${className}`} aria-hidden="true" data-effect={failed?'fallback':'shadergradient'}>
    <div className="source-fallback"/>{ready&&!failed&&<Boundary onError={()=>setFailed(true)}><div className="source-scene-spring">
      <ShaderGradientCanvas pixelDensity={1} pointerEvents="none" lazyLoad={false} preserveDrawingBuffer powerPreference="low-power">
        {sculpture?<ShaderGradient type="sphere" animate="on" cAzimuthAngle={250} cDistance={1.5} cPolarAngle={90} cameraZoom={3.2} color1="#83bdb6" color2="#1b4c58" color3="#d1dcd2" brightness={1.5} lightType="3d" grain="off" positionX={0} positionY={0} positionZ={0} reflection={.5} rotationX={0} rotationY={0} rotationZ={140} shader="defaults" uAmplitude={7} uDensity={.8} uFrequency={5.5} uSpeed={.3} uStrength={.4} uTime={0} wireframe={false}/>:<ShaderGradient type="waterPlane" animate="on" cAzimuthAngle={170} cDistance={4.4} cPolarAngle={70} cameraZoom={1} color1="#03090d" color2="#124146" color3="#345554" brightness={.72} lightType="3d" grain="off" positionX={0} positionY={.9} positionZ={-.3} reflection={.04} rotationX={45} rotationY={0} rotationZ={0} shader="defaults" uAmplitude={0} uDensity={1.2} uFrequency={0} uSpeed={.2} uStrength={3.4} uTime={0} wireframe={false}/>}
        <Budget onCanvas={onCanvas} tilt={{rotateX,rotateY}} sculpture={sculpture} pose={pose}/>
      </ShaderGradientCanvas>
    </div></Boundary>}
  </div>;
}
