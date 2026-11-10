import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {catPerch,createCatSound,readCalmMode,saveCalmMode} from '/js/calm-cat.js';

// Each strip is rendered at 24 frames per second on a 64px pixel grid.
const framesByPose={idle:144,stretching:48,walk:72,laying:36,sleeping1:144,waking:48,meow:58,nuzzle:72,grooming:96,curious:60};
const routine=[['idle',8000],['stretching',2000],['walk',3000],['idle',8000],['laying',1250],['sleeping1',16000],['waking',1750]];
function Paw(){return <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="5" cy="9" rx="2" ry="2.8" transform="rotate(-25 5 9)"/><ellipse cx="10" cy="5.5" rx="2" ry="2.8"/><ellipse cx="16" cy="6" rx="2" ry="2.8" transform="rotate(15 16 6)"/><ellipse cx="20" cy="11" rx="1.8" ry="2.5" transform="rotate(30 20 11)"/><path d="M6.5 17c0-2 3-5.5 5.5-5.5s5.5 3.5 5.5 5.5c0 3-3 2-5.5 2s-5.5 1-5.5-2Z"/></svg>;}
function Speaker({on}){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4 6 8H3v8h3l5 4Z"/>{on?<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>:<path d="m16 9 5 6m0-6-5 6"/>}</svg>;}

// One controller per page. Only the small cat hit area receives pointer events;
// it never follows the cursor, opens a chat, or reads conversation content.
export function CalmMode({home=false,headerHost=null}){
  const [enabled,setEnabled]=useState(readCalmMode),[sounds,setSounds]=useState(false),[notice,setNotice]=useState('');
  const [pose,setPose]=useState('idle'),[travel,setTravel]=useState(0),[position,setPosition]=useState(null),[paused,setPaused]=useState(document.hidden);
  const sound=useRef(null),petUntil=useRef(0),petAt=useRef(-Infinity),petTimer=useRef(null),cat=useRef(null);
  useEffect(()=>{
    const controller=createCatSound({onChange:setSounds,onError:()=>setNotice('Cat sounds could not play. You can try turning them on again.')});sound.current=controller;
    return()=>{controller.dispose();sound.current=null;};
  },[]);
  useEffect(()=>{
    document.body.dataset.calm=String(enabled);
    if(!enabled){sound.current?.enable(false);setNotice('');setPosition(null);}
    return()=>{delete document.body.dataset.calm;clearTimeout(petTimer.current);};
  },[enabled]);
  useEffect(()=>{
    const sync=event=>{if(event.key==='nox.calm.v1')setEnabled(readCalmMode());};
    window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
  },[]);
  useEffect(()=>{
    if(!enabled)return;
    let frame=0;
    const measure=()=>{
      cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
        const size=innerWidth<=700?80:96,viewport=window.visualViewport;
        const support=home?document.querySelector('.contact-hud'):document.getElementById('chat-form');
        const showing=home||document.body.dataset.view==='conversation';
        if(!showing||!support||!support.getClientRects().length){setPosition(null);return;}
        const rect=support.getBoundingClientRect();
        const rail=home?{left:rect.left,right:Math.min(rect.left+150,innerWidth-12),top:rect.bottom-4}:rect;
        const bounds={support:rail,width:innerWidth,height:(viewport?.height||innerHeight)+(viewport?.offsetTop||0),size};
        const base=catPerch(bounds),walk=catPerch({...bounds,travel});
        setPosition({...base,size,offset:walk.x-base.x});
      });
    };
    const hush=()=>{
      const state=document.body.dataset;
      const quiet=document.hidden||state.callOpen==='true'||['speaking','listening','preparing'].includes(state.voiceState)||['speaking','listening'].includes(state.activity)||!home&&state.view!=='conversation';
      sound.current?.quiet(quiet);setPaused(document.hidden);measure();
    };
    const observer=new MutationObserver(hush);observer.observe(document.body,{attributes:true,attributeFilter:['data-view','data-call-open','data-voice-state','data-activity']});
    const resize=new ResizeObserver(measure);const support=home?document.querySelector('.contact-hud'):document.getElementById('chat-form');if(support)resize.observe(support);
    document.addEventListener('visibilitychange',hush);window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);window.visualViewport?.addEventListener('scroll',measure);
    hush();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();document.removeEventListener('visibilitychange',hush);window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('scroll',measure);};
  },[enabled,home,travel]);
  useEffect(()=>{
    if(!enabled||paused)return;
    let step=0,timer;
    const next=()=>{
      if(performance.now()<petUntil.current){timer=setTimeout(next,700);return;}
      const [action,duration]=routine[step++%routine.length];setPose(action);
      if(action==='walk'&&!matchMedia('(prefers-reduced-motion:reduce)').matches)setTravel(value=>value===0?(home?(innerWidth<=700?12:24):48):0);
      timer=setTimeout(next,duration);
    };
    next();return()=>clearTimeout(timer);
  },[enabled,paused,home]);
  function toggle(){setEnabled(value=>saveCalmMode(!value));}
  function pet(){
    const now=performance.now();if(now-petAt.current<900)return;petAt.current=now;petUntil.current=now+2400;setPose('meow');void sound.current?.pet();
    clearTimeout(petTimer.current);petTimer.current=setTimeout(()=>setPose('idle'),2400);
    if(!matchMedia('(prefers-reduced-motion:reduce)').matches)cat.current?.animate([{transform:'translateY(0)'},{transform:'translateY(-3px)'},{transform:'translateY(0)'}],{duration:500,easing:'ease-out'});
  }
  const frames=framesByPose[pose];
  const controls=<div className="calm-controls"><button className="calm-toggle" type="button" onClick={toggle} aria-label="Calm mode" aria-pressed={enabled} title={enabled?'Leave Calm mode':'Calm mode · a little cat company'}><Paw/><span>Calm mode</span></button>{enabled&&<button className="calm-sound" type="button" onClick={()=>{setNotice('');void sound.current?.enable(!sounds);}} aria-pressed={sounds} aria-label={sounds?'Mute cat sounds':'Turn on cat sounds'} title={sounds?'Mute cat sounds':'Cat sounds are off'}><Speaker on={sounds}/></button>}<span className="sr-only" role="status">{notice}</span></div>;
  return <>{controls}{headerHost&&createPortal(controls,headerHost)}
    {enabled&&position&&createPortal(
      <div className="calm-cat" data-pose={pose} data-paused={paused} style={{
        left:position.x,top:position.y,'--cat-size':`${position.size}px`,
        '--cat-facing':position.offset>0?-1:1,'--cat-frames':frames,
        '--cat-duration':`${frames/24}s`,'--cat-sheet':`url('/assets/calm/tabby-${pose}.png')`
      }}>
        <div className="calm-cat-walk" style={{transform:`translateX(${position.offset}px)`}}>
          <button ref={cat} type="button" className="calm-cat-pet" aria-label="Pet the cat"
            title={sounds?'Pet the cat':'Pet the cat · sounds are off'} onClick={pet}>
            <span key={pose} className="calm-cat-sprite" aria-hidden="true"/>
          </button>
        </div>
      </div>,document.body)}
  </>;
}
