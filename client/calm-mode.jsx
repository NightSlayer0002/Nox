import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {catPerch,createCatSound,readCalmMode,saveCalmMode} from '/js/calm-cat.js';

// Each strip is rendered at 24 frames per second on a 64px pixel grid.
const framesByPose={idle:144,stretching:48,walk:72,laying:36,sleeping1:144,waking:48,meow:58,nuzzle:72,grooming:96,curious:60};
const routine=[['idle',2500],['walk',3000],['idle',6000],['grooming',4000],['walk',3000],['idle',8000],['curious',2500],['idle',5000],['stretching',2000],['laying',1500],['sleeping1',18000],['waking',2000]];
function Paw(){return <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="5" cy="9" rx="2" ry="2.8" transform="rotate(-25 5 9)"/><ellipse cx="10" cy="5.5" rx="2" ry="2.8"/><ellipse cx="16" cy="6" rx="2" ry="2.8" transform="rotate(15 16 6)"/><ellipse cx="20" cy="11" rx="1.8" ry="2.5" transform="rotate(30 20 11)"/><path d="M6.5 17c0-2 3-5.5 5.5-5.5s5.5 3.5 5.5 5.5c0 3-3 2-5.5 2s-5.5 1-5.5-2Z"/></svg>;}
function Speaker({on}){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4 6 8H3v8h3l5 4Z"/>{on?<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>:<path d="m16 9 5 6m0-6-5 6"/>}</svg>;}

// One controller per page. Only the small cat hit area receives pointer events;
// it never follows the cursor, opens a chat, or reads conversation content.
export function CalmMode({home=false,headerHost=null}){
  const [enabled,setEnabled]=useState(readCalmMode),[sounds,setSounds]=useState(false),[notice,setNotice]=useState('');
  const [pose,setPose]=useState('idle'),[travel,setTravel]=useState(0),[position,setPosition]=useState(null),[paused,setPaused]=useState(document.hidden);
  const [affection,setAffection]=useState(0),[facing,setFacing]=useState(1),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion:reduce)').matches);
  const [motionOverride,setMotionOverride]=useState(false);
  const animate=!reduced||motionOverride;
  const playground=Boolean(position?.playground);
  const sound=useRef(null),react=useRef(null),petAt=useRef(-Infinity),curiousAt=useRef(-Infinity),walker=useRef(null),poseNow=useRef('idle'),walkRight=useRef(true);
  useEffect(()=>{
    const controller=createCatSound({onChange:setSounds,onError:()=>setNotice('Cat sounds could not play. You can try turning them on again.')});sound.current=controller;
    return()=>{controller.dispose();sound.current=null;};
  },[]);
  useEffect(()=>{
    document.body.dataset.calm=String(enabled);
    if(!enabled){sound.current?.enable(false);setNotice('');setPosition(null);}
    return()=>{delete document.body.dataset.calm;};
  },[enabled]);
  useEffect(()=>{
    const preference=matchMedia('(prefers-reduced-motion:reduce)'),sync=()=>setReduced(preference.matches);
    preference.addEventListener('change',sync);return()=>preference.removeEventListener('change',sync);
  },[]);
  useEffect(()=>{
    if(!enabled)return;
    // Warm the small local strips so an interaction doesn't display an empty
    // frame while its first image request is in flight.
    for(const name of Object.keys(framesByPose)){const image=new Image();image.src=`/assets/calm/tabby-${name}.png`;}
  },[enabled]);
  useEffect(()=>{sound.current?.mood(pose);},[pose]);
  useEffect(()=>{
    const sync=event=>{if(event.key==='nox.calm.v1')setEnabled(readCalmMode());};
    window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
  },[]);
  useEffect(()=>{
    if(!enabled)return;
    let frame=0;
    const measure=()=>{
      cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
        const small=innerWidth<=700,viewport=window.visualViewport;
        const height=(viewport?.height||innerHeight)+(viewport?.offsetTop||0);
        const room=home?document.querySelector('.cinematic-viewport'):null;
        const roomRect=room?.getBoundingClientRect();
        // Transfer only when the floor is visible. Once inside, the portal
        // scrolls with the room rather than chasing viewport coordinates.
        const inRoom=Boolean(roomRect&&roomRect.bottom<=height+16&&roomRect.bottom>120&&roomRect.top<height);
        const size=inRoom?(small?56:64):(small?72:80);
        const support=home?document.querySelector('.contact-hud'):document.getElementById('chat-form');
        const showing=home||document.body.dataset.view==='conversation';
        if(!showing||!support||!support.getClientRects().length){setPosition(null);return;}
        const rect=support.getBoundingClientRect();
        const rail=inRoom?{left:18,right:Math.min(roomRect.width-18,small?240:360),top:roomRect.height-10}:home?{left:rect.left,right:Math.min(rect.left+(small?190:240),innerWidth-12),top:rect.top-6}:rect;
        const bounds={support:rail,width:inRoom?roomRect.width:innerWidth,height:inRoom?roomRect.height:height,size};
        const base=catPerch(bounds),walk=catPerch({...bounds,travel});
        const next={...base,size,offset:walk.x-base.x,playground:inRoom};
        setPosition(previous=>previous&&Object.keys(next).every(key=>previous[key]===next[key])?previous:next);
      });
    };
    const hush=()=>{
      const state=document.body.dataset;
      const quiet=document.hidden||state.callOpen==='true'||['speaking','listening','preparing'].includes(state.voiceState)||['speaking','listening'].includes(state.activity)||!home&&state.view!=='conversation';
      sound.current?.quiet(quiet);setPaused(document.hidden||state.callOpen==='true'||!home&&state.view!=='conversation');measure();
    };
    const observer=new MutationObserver(hush);observer.observe(document.body,{attributes:true,attributeFilter:['data-view','data-call-open','data-voice-state','data-activity']});
    const resize=new ResizeObserver(measure);const support=home?document.querySelector('.contact-hud'):document.getElementById('chat-form');if(support)resize.observe(support);
    const homeRoot=home&&document.getElementById('home-root');if(homeRoot)resize.observe(homeRoot);
    if(home)window.addEventListener('scroll',measure,{passive:true});
    document.addEventListener('visibilitychange',hush);window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);window.visualViewport?.addEventListener('scroll',measure);
    hush();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();document.removeEventListener('visibilitychange',hush);window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure);window.visualViewport?.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('scroll',measure);};
  },[enabled,home,travel]);
  useEffect(()=>{
    if(!enabled||paused)return;
    let step=playground?1:0,timer;
    const show=action=>{poseNow.current=action;setPose(action);};
    const settle=()=>{show('idle');if(animate)timer=setTimeout(next,3500);};
    const next=()=>{
      const [action,duration]=routine[step++%routine.length];show(action);
      if(action==='walk'){
        setFacing(walkRight.current?-1:1);
        setTravel(walkRight.current?(playground?(innerWidth<=700?120:200):(innerWidth<=700?64:88)):0);
        walkRight.current=!walkRight.current;
      }
      timer=setTimeout(next,duration);
    };
    react.current=kind=>{
      const sleeping=['sleeping1','laying'].includes(poseNow.current);
      if(kind==='curious'&&poseNow.current!=='idle'||kind==='pet'&&['nuzzle','waking'].includes(poseNow.current))return;
      clearTimeout(timer);step=1;
      if(poseNow.current==='walk'&&walker.current){
        const frame=walker.current.parentElement.getBoundingClientRect();
        const offset=walker.current.getBoundingClientRect().left-frame.left;
        setTravel(offset);setPosition(value=>value?{...value,offset}:value);
      }
      const nuzzle=()=>{show('nuzzle');setAffection(value=>value+1);void sound.current?.pet();timer=setTimeout(settle,3000);};
      if(kind==='curious'){show('curious');timer=setTimeout(settle,2500);}
      else if(sleeping&&animate){show('waking');timer=setTimeout(nuzzle,2000);}
      else nuzzle();
    };
    setAffection(0);
    if(!animate)show('idle');
    else if(playground){show('idle');setTravel(0);walkRight.current=true;timer=setTimeout(next,150);}
    else next();
    return()=>{clearTimeout(timer);react.current=null;};
  },[enabled,paused,home,animate,playground]);
  function toggle(){setEnabled(value=>saveCalmMode(!value));}
  function pet(){
    const now=performance.now();if(now-petAt.current<900)return;petAt.current=now;react.current?.('pet');
  }
  function greet(event){
    if(event.pointerType!=='mouse'||!animate)return;
    const now=performance.now();if(now-curiousAt.current<12000)return;curiousAt.current=now;react.current?.('curious');
  }
  const frames=framesByPose[pose];
  const controls=<div className="calm-controls"><button className="calm-toggle" type="button" onClick={toggle} aria-label="Cat companion" aria-pressed={enabled} title={enabled?'Hide cat':'Bring out the cat'}><Paw/></button>{enabled&&reduced&&<button className="calm-motion" type="button" onClick={()=>setMotionOverride(value=>!value)} aria-label={animate?'Pause cat animation':'Animate cat'} title={animate?'Pause cat animation':'Reduced motion is on · animate this cat'}><svg viewBox="0 0 24 24" aria-hidden="true">{animate?<path d="M8 5v14M16 5v14"/>:<path d="m8 5 11 7-11 7Z"/>}</svg></button>}{enabled&&<button className="calm-sound" type="button" onClick={()=>{setNotice('');void sound.current?.enable(!sounds);}} aria-pressed={sounds} aria-label={sounds?'Mute cat sounds':'Turn on cat sounds'} title={sounds?'Mute cat sounds':'Cat sounds are off'}><Speaker on={sounds}/></button>}<span className="sr-only" role="status">{notice}</span></div>;
  return <>{controls}{headerHost&&createPortal(controls,headerHost)}
    {enabled&&position&&createPortal(
      <div className="calm-cat" data-pose={pose} data-paused={paused} data-motion={animate} data-perch={playground?'playground':'interface'} style={{
        left:position.x,top:position.y,'--cat-size':`${position.size}px`,
        '--cat-facing':facing,'--cat-frames':frames,
        '--cat-duration':`${frames/24}s`,'--cat-sheet':`url('/assets/calm/tabby-${pose}.png')`
      }}>
        <div ref={walker} className="calm-cat-walk" style={{transform:`translateX(${position.offset}px)`}}>
          <button type="button" className="calm-cat-pet" aria-label="Pet the cat"
            title={sounds?'Pet the cat':'Pet the cat · sounds are off'} onPointerEnter={greet} onClick={pet}>
            <span key={pose} className="calm-cat-sprite" aria-hidden="true"/>
          </button>
          {pose==='nuzzle'&&<span key={affection} className="calm-cat-heart" aria-hidden="true"><svg viewBox="0 0 9 8"><path d="M1 0h2v1h1v1h1V1h1V0h2v1h1v3H8v1H7v1H6v1H5v1H4V7H3V6H2V5H1V4H0V1h1Z"/></svg></span>}
        </div>
      </div>,playground?document.querySelector('.cinematic-viewport'):document.body)}
  </>;
}
