// Adapted from ruucm/shadergradient apps/examples/example-vite-react/src/App.tsx
// and packages/shadergradient/src/presets.ts (Mint). Renderer: pmndrs/R3F.
import React,{Component,useEffect,useRef,useState} from 'react';
import {ShaderGradient,ShaderGradientCanvas} from '@shadergradient/react';
import {useFrame,useThree} from '@react-three/fiber';
import {createFrameBudget,sourcePixelRatio,SOURCE_MATERIAL_FPS} from '/js/source-effects.js';
import {createTerrainMotion,advanceTerrain} from '/js/source-terrain.js';
import {readMotionPreference} from '/js/preferences.js';

class Boundary extends Component{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onError?.();}
  render(){return this.state.failed?<div className="source-fallback" aria-hidden="true"/>:this.props.children;}
}
function revealTerrain(material,atmospheric){
  if(!atmospheric||material.userData.terrainRelief)return;
  material.userData.terrainRelief=true;
  const compile=material.onBeforeCompile;
  // The defaults/waterPlane shader uses physical lighting. Patch that actual
  // output, retaining its animated geometry and the surrounding CSS palette.
  material.onBeforeCompile=function(shader,...args){
    compile.call(this,shader,...args);
    shader.vertexShader='varying vec2 noxTerrainUv;\n'+shader.vertexShader.replace('void main() {','void main() {\n  noxTerrainUv = uv;');
    shader.fragmentShader='varying vec2 noxTerrainUv;\n'+shader.fragmentShader
      // Unbounded height extrapolated the gradient into negative RGB, making
      // abrupt dark shelves rather than a continuous material.
      .replace('color3, vPos.z)','color3, smoothstep(-1.8, 2.2, vPos.z))')
      .replace('gl_FragColor = vec4(outgoingLight, diffuseColor.a);',
        `vec2 edge = smoothstep(vec2(0.0), vec2(0.24), noxTerrainUv) * smoothstep(vec2(0.0), vec2(0.24), 1.0 - noxTerrainUv);
         vec3 reliefNormal = normalize(cross(dFdx(vPos), dFdy(vPos)));
         float veil = smoothstep(0.08, 0.65, abs(reliefNormal.z));
         gl_FragColor = vec4(outgoingLight, diffuseColor.a * edge.x * edge.y * veil);`);
  };
  material.transparent=true;material.depthWrite=false;
  material.customProgramCacheKey=()=> 'nox-water-atmosphere-v1';
  material.needsUpdate=true;
}
function Budget({onCanvas,pose}){
  const {gl,setFrameloop,invalidate}=useThree(),due=useRef(createFrameBudget(SOURCE_MATERIAL_FPS));
  const terrain=useRef(createTerrainMotion()),lastFrame=useRef(null),frames=useRef(0);
  const signals=useRef({pointerX:0,pointerY:0,scroll:0,scrollImpulse:0,typingUntil:0,reduced:!readMotionPreference()});
  useEffect(()=>{
    const input=signals.current;
    // Use the same explicit app motion choice as NOX and his companions.
    input.reduced=!readMotionPreference();
    const pointer=event=>{
      if(event.pointerType==='touch'||!event.isPrimary)return;
      input.pointerX=event.clientX/Math.max(1,innerWidth)*2-1;
      input.pointerY=event.clientY/Math.max(1,innerHeight)*2-1;
    };
    const reset=()=>{input.pointerX=0;input.pointerY=0;input.typingUntil=0;};
    const leave=event=>{if(!event.relatedTarget)reset();};
    const scroll=event=>{
      const node=event?.target===document||!event?document.scrollingElement:event.target;
      if(!node||!Number.isFinite(node.scrollTop))return;
      const next=node.scrollTop/Math.max(1,node.scrollHeight-node.clientHeight);
      input.scrollImpulse=Math.max(-1,Math.min(1,input.scrollImpulse+(next-input.scroll)*4));
      input.scroll=next;
    };
    const typing=event=>{
      const target=event.target;
      // Only the fact of editing is observed. No entered text leaves its field.
      if(target?.isContentEditable||target?.tagName==='TEXTAREA'||target?.tagName==='INPUT'&&['text','search','email','url','tel','password'].includes(target.type))input.typingUntil=performance.now()+850;
    };
    scroll();
    document.addEventListener('pointermove',pointer,{passive:true});
    document.addEventListener('pointerout',leave,{passive:true});
    document.addEventListener('scroll',scroll,{passive:true,capture:true});
    document.addEventListener('input',typing,{passive:true});
    window.addEventListener('blur',reset);
    return()=>{
      document.removeEventListener('pointermove',pointer);document.removeEventListener('pointerout',leave);
      document.removeEventListener('scroll',scroll,true);document.removeEventListener('input',typing);
      window.removeEventListener('blur',reset);
    };
  },[]);
  useEffect(()=>{
    // Publish only after the authored terrain has rendered, never its startup frame.
    let visible=true;const visibility=()=>{lastFrame.current=null;setFrameloop(document.hidden||!visible?'never':'always');if(!document.hidden&&visible)invalidate();};
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;visibility();});observer.observe(gl.domElement);
    document.addEventListener('visibilitychange',visibility);visibility();
    return()=>{observer.disconnect();document.removeEventListener('visibilitychange',visibility);onCanvas?.(null);};
  },[gl,setFrameloop,invalidate,onCanvas]);
  useFrame(({gl,scene,camera})=>{
    const now=performance.now();if(!due.current(now))return;
    const delta=lastFrame.current===null?1/SOURCE_MATERIAL_FPS:(now-lastFrame.current)/1000;lastFrame.current=now;
    const mesh=scene.getObjectByName('shadergradient-mesh');
    if(mesh){
      revealTerrain(mesh.material,Boolean(pose));
      const input=signals.current;
      terrain.current=advanceTerrain(terrain.current,{...input,activity:document.body.dataset.activity,voice:document.body.dataset.voiceState,typing:now<input.typingUntil?1:0},delta);
      input.scrollImpulse=0;
      const water=terrain.current,uniforms=mesh.material.userData;
      // These are the incumbent water shader's actual deformation uniforms.
      // Shape and metal use one cadence, independent of the display rate.
      if(uniforms.uTime)uniforms.uTime.value=water.time;
      if(uniforms.uNoiseStrength)uniforms.uNoiseStrength.value=water.strength*(pose?.48:1);
      if(uniforms.uNoiseDensity)uniforms.uNoiseDensity.value=water.density;
      mesh.rotation.set(Math.PI/4+water.tiltX,water.tiltY,(pose?.waterTurn||0)+water.turn);
      mesh.position.set((pose?.waterX||0)+water.x,.9+water.y,-.3);
      gl.domElement.dataset.scrollTurn=(pose?.waterTurn||0).toFixed(3);
      gl.domElement.dataset.motion=input.reduced?'reduced':'flow';
      gl.domElement.dataset.terrainTime=uniforms.uTime?uniforms.uTime.value.toFixed(2):'unavailable';
      gl.domElement.dataset.terrainEnergy=water.energy.toFixed(3);
      gl.domElement.dataset.terrainDrift=water.x.toFixed(3);
    }
    if(!mesh)return;
    gl.render(scene,camera);
    if(frames.current===1){gl.domElement.closest?.('.source-scene')?.setAttribute('data-render-ready','true');onCanvas?.(gl.domElement);}
    gl.domElement.dataset.source='shadergradient';
    gl.domElement.dataset.geometry='water-plane';
    gl.domElement.dataset.frame=String(++frames.current);
  },1);
  return null;
}
function SourceScene({onCanvas,className='',pose}){
  const host=useRef(),[ready,setReady]=useState(false),[failed,setFailed]=useState(false);
  const [pixelDensity,setPixelDensity]=useState(()=>sourcePixelRatio(globalThis.devicePixelRatio));
  useEffect(()=>{const observer=new IntersectionObserver(entries=>{if(entries[0].isIntersecting){setReady(true);observer.disconnect();}},{rootMargin:'100px'});observer.observe(host.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{const resize=()=>setPixelDensity(sourcePixelRatio(window.devicePixelRatio));window.addEventListener('resize',resize,{passive:true});return()=>window.removeEventListener('resize',resize);},[]);
  return <div ref={host} className={`source-scene ${className}`} aria-hidden="true" data-effect={failed?'fallback':'shadergradient'}>
    <div className="source-fallback"/>{ready&&!failed&&<Boundary onError={()=>setFailed(true)}><div className="source-scene-spring">
      <ShaderGradientCanvas pixelDensity={pixelDensity} pointerEvents="none" lazyLoad={false} powerPreference="default">
        <ShaderGradient type="waterPlane" animate="off" cAzimuthAngle={170} cDistance={4.4} cPolarAngle={70} cameraZoom={1} color1="#0c1b25" color2="#284a50" color3="#49766f" brightness={.62} lightType="3d" grain="off" positionX={0} positionY={.9} positionZ={-.3} reflection={.04} rotationX={45} rotationY={0} rotationZ={0} shader="defaults" uAmplitude={0} uDensity={1.12} uFrequency={0} uSpeed={.32} uStrength={3.6} uTime={0} wireframe={false}/>
        <Budget onCanvas={onCanvas} pose={pose}/>
      </ShaderGradientCanvas>
    </div></Boundary>}
  </div>;
}
// Expression and chapter state do not change this scene's stable inputs.
// Avoid recreating ShaderGradient's material during those parent updates.
export default React.memo(SourceScene);
