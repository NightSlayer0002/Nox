// Adapted from ruucm/shadergradient apps/examples/example-vite-react/src/App.tsx
// and packages/shadergradient/src/presets.ts (Mint). Renderer: pmndrs/R3F.
import React,{Component,useEffect,useRef,useState} from 'react';
import {ShaderGradient,ShaderGradientCanvas} from '@shadergradient/react';
import {useFrame,useThree} from '@react-three/fiber';
import {animated,useSpring} from '@react-spring/web';

class Boundary extends Component{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onError?.();}
  render(){return this.state.failed?<div className="source-fallback" aria-hidden="true"/>:this.props.children;}
}
function Budget({onCanvas}){
  const {gl,setFrameloop,invalidate}=useThree(),last=useRef(-1);
  useEffect(()=>{
    onCanvas?.(gl.domElement);
    const visibility=()=>{setFrameloop(document.hidden?'never':'always');if(!document.hidden)invalidate();};
    document.addEventListener('visibilitychange',visibility);visibility();
    return()=>document.removeEventListener('visibilitychange',visibility);
  },[gl,setFrameloop,invalidate,onCanvas]);
  useFrame(({gl,scene,camera,clock})=>{if(clock.elapsedTime-last.current<1/30)return;last.current=clock.elapsedTime;gl.render(scene,camera);gl.domElement.dataset.source='shadergradient';gl.domElement.dataset.frame=String(Math.round(clock.elapsedTime*30));},1);
  return null;
}
export default function SourceScene({onCanvas,interactive=false,className=''}){
  const host=useRef(),[ready,setReady]=useState(false),[failed,setFailed]=useState(false);
  const [{rotateX,rotateY},spring]=useSpring(()=>({rotateX:0,rotateY:0,config:{mass:1.2,tension:90,friction:24}}));
  useEffect(()=>{const observer=new IntersectionObserver(entries=>{if(entries[0].isIntersecting){setReady(true);observer.disconnect();}},{rootMargin:'100px'});observer.observe(host.current);return()=>observer.disconnect();},[]);
  const pointer=e=>{if(!interactive||e.pointerType==='touch')return;const rect=host.current.getBoundingClientRect();spring.start({rotateX:(.5-(e.clientY-rect.top)/rect.height)*4,rotateY:((e.clientX-rect.left)/rect.width-.5)*6});};
  return <div ref={host} className={`source-scene ${className}`} aria-hidden="true" onPointerMove={pointer} onPointerLeave={()=>spring.start({rotateX:0,rotateY:0})} data-effect={failed?'fallback':'shadergradient'}>
    <div className="source-fallback"/>{ready&&!failed&&<Boundary onError={()=>setFailed(true)}><animated.div className="source-scene-spring" style={{rotateX,rotateY}}>
      <ShaderGradientCanvas pixelDensity={1} pointerEvents="none" lazyLoad={false} preserveDrawingBuffer powerPreference="low-power">
        <ShaderGradient type="waterPlane" animate="on" cAzimuthAngle={170} cDistance={4.4} cPolarAngle={70} cameraZoom={1} color1="#07171b" color2="#3c8d88" color3="#baccc0" brightness={1.2} lightType="3d" grain="off" positionX={0} positionY={.9} positionZ={-.3} reflection={.1} rotationX={45} rotationY={0} rotationZ={0} shader="defaults" uAmplitude={0} uDensity={1.2} uFrequency={0} uSpeed={.2} uStrength={3.4} uTime={0} wireframe={false}/>
        <Budget onCanvas={onCanvas}/>
      </ShaderGradientCanvas>
    </animated.div></Boundary>}
  </div>;
}
