import React,{useEffect,useRef,useState} from 'react';
import {animated,useSpring,to} from '@react-spring/web';
import {LiquidButton} from './liquid-button.jsx';
import {createHoldGate} from '/js/first-contact.js';

// A held press acts on the source shaders and character, not a loading bar.
// Short presses/cancellation never change material. Keyboard activation is instant.
export function HoldButton({metal,source,onComplete,onProgress,disabled=false}){
  const gate=useRef(createHoldGate(900)),frame=useRef(0),pointer=useRef(null),target=useRef(null),callbacks=useRef({onComplete,onProgress});
  const interaction=useRef({pressure:0,hover:0}),[holding,setHolding]=useState(false);
  const [{x,y,sx,sy,tilt},spring]=useSpring(()=>({x:0,y:0,sx:1,sy:1,tilt:0,config:{mass:.8,tension:240,friction:17}}));
  useEffect(()=>{callbacks.current={onComplete,onProgress};},[onComplete,onProgress]);
  const cancel=(update=true)=>{
    const id=pointer.current;gate.current.cancel(id);pointer.current=null;cancelAnimationFrame(frame.current);
    if(id!==null&&target.current?.hasPointerCapture(id))target.current.releasePointerCapture(id);
    interaction.current.pressure=0;callbacks.current.onProgress?.(0);
    if(update){setHolding(false);spring.start({x:0,y:0,sx:1,sy:1,tilt:0});}
  };
  useEffect(()=>{
    const hide=()=>{if(document.hidden)cancel();},blur=()=>cancel();
    document.addEventListener('visibilitychange',hide);window.addEventListener('blur',blur);
    return()=>{cancel(false);document.removeEventListener('visibilitychange',hide);window.removeEventListener('blur',blur);};
  },[]);
  useEffect(()=>{if(disabled)cancel();},[disabled]);
  const begin=event=>{
    if(disabled||event.button!==0||!event.isPrimary||!gate.current.begin(event.pointerId,performance.now()))return;
    event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current=event.pointerId;target.current=event.currentTarget;setHolding(true);
    const advance=now=>{
      const state=gate.current.advance(now);interaction.current.pressure=state.progress;callbacks.current.onProgress?.(state.progress);
      spring.start({sx:1+state.progress*.08,sy:1-state.progress*.13});
      if(state.complete){cancel();callbacks.current.onComplete();return;}
      if(gate.current.active)frame.current=requestAnimationFrame(advance);
    };
    frame.current=requestAnimationFrame(advance);
  };
  const release=event=>{if(event.pointerId===pointer.current)cancel();};
  return <animated.div className="material-press" style={{transform:to([x,y,sx,sy,tilt],(px,py,scaleX,scaleY,angle)=>`translate(${px}px,${py}px) rotate(${angle}deg) scale(${scaleX},${scaleY})`)}}>
    <LiquidButton className="material-control" source={source} interaction={interaction} pressed={metal} disabled={disabled}
      onPointerDown={begin} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
      onPointerEnter={()=>{interaction.current.hover=1;spring.start({y:-3});}}
      onPointerMove={event=>{if(event.pointerType==='touch')return;const box=event.currentTarget.getBoundingClientRect(),dx=Math.max(-1,Math.min(1,(event.clientX-box.left)/box.width*2-1));spring.start({x:dx*5,tilt:dx*1.8});}}
      onPointerLeave={()=>{interaction.current.hover=0;if(!gate.current.active)spring.start({x:0,y:0,tilt:0});}}
      onKeyDown={event=>{if(event.key==='Escape')cancel();}}
      onClick={event=>{if(event.detail===0&&!disabled){cancel();callbacks.current.onComplete();}}} aria-describedby="material-help">
      <span className="material-mark" aria-hidden="true"><img src="/icon.svg" alt=""/></span>
      <span className="material-label"><span>{holding?'Letting go of the edges…':metal?'Hold to soften':'Hold to liquify'}</span><small>{holding?'Keep pressing. Watch him change.':metal?'Chrome, with a soft side.':'A little pressure. A new state.'}</small></span>
    </LiquidButton>
  </animated.div>;
}
