import React,{useEffect,useRef,useState} from 'react';
import {LiquidButton} from './liquid-button.jsx';
import {createHoldGate} from '/js/first-contact.js';

// Native keyboard activation is immediate. Pointer activation is a deliberate
// 900ms hold; cancellation, tab hiding and unmount never complete a short press.
export function HoldButton({metal,source,onComplete,disabled=false}){
  const gate=useRef(createHoldGate(900)),frame=useRef(0),pointer=useRef(null),target=useRef(null),complete=useRef(onComplete);
  const [progress,setProgress]=useState(0),[holding,setHolding]=useState(false);
  useEffect(()=>{complete.current=onComplete;},[onComplete]);
  const cancel=(update=true)=>{const id=pointer.current;gate.current.cancel(id);pointer.current=null;cancelAnimationFrame(frame.current);if(id!==null&&target.current?.hasPointerCapture(id))target.current.releasePointerCapture(id);if(update){setHolding(false);setProgress(0);}};
  useEffect(()=>{
    const hide=()=>{if(document.hidden)cancel();},blur=()=>cancel();document.addEventListener('visibilitychange',hide);window.addEventListener('blur',blur);
    return()=>{cancel(false);document.removeEventListener('visibilitychange',hide);window.removeEventListener('blur',blur);};
  },[]);
  const begin=event=>{
    if(disabled||event.button!==0||!event.isPrimary||!gate.current.begin(event.pointerId,performance.now()))return;
    event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);pointer.current=event.pointerId;target.current=event.currentTarget;setHolding(true);
    const advance=now=>{const state=gate.current.advance(now);setProgress(state.progress);if(state.complete){setHolding(false);complete.current();return;}if(gate.current.active)frame.current=requestAnimationFrame(advance);};
    frame.current=requestAnimationFrame(advance);
  };
  const release=event=>{if(event.pointerId===pointer.current)cancel();};
  return <LiquidButton className="material-control" source={source} pressed={metal} disabled={disabled} onPointerDown={begin} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onKeyDown={event=>{if(event.key==='Escape')cancel();}} onClick={event=>{if(event.detail===0&&!disabled){cancel();complete.current();}}} aria-describedby="material-help" style={{'--hold-progress':progress}}><span className="hold-fill" aria-hidden="true"/><span>{holding?'Changing matter…':metal?'Hold to soften':'Hold to liquify'}</span><span aria-hidden="true"> ↔</span></LiquidButton>;
}
