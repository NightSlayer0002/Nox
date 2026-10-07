import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { useSpring } from '@react-spring/web';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);
function applySavedTheme(){
  let theme='light';try{if(localStorage.getItem('nox.theme.v1')==='dark')theme='dark';}catch{}
  document.documentElement.dataset.theme=theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#101915':'#f5f3ec');
}
applySavedTheme();
const clamp=(n,low,high)=>Math.max(low,Math.min(high,n));
const ease=[.22,1,.36,1];
const panelTransition={duration:.22,ease};

function Brand(){return <a className="home-brand" href="/" aria-label="NOX home"><span className="home-brand-face" aria-hidden="true"><i/><i/></span><span>NOX<span className="brand-registration"> / LABORATORY</span></span></a>;}
function Arrow(){return <span aria-hidden="true">↗</span>;}

function Header(){
  const [open,setOpen]=useState(false),toggle=useRef(null),menu=useRef(null);
  useEffect(()=>{
    if(!open)return;
    menu.current?.querySelector('a')?.focus();
    const escape=e=>{if(e.key==='Escape'){setOpen(false);toggle.current?.focus();}};
    const resize=()=>{if(innerWidth>760)setOpen(false);};
    const outside=e=>{if(!menu.current?.contains(e.target)&&!toggle.current?.contains(e.target))setOpen(false);};
    document.addEventListener('keydown',escape);document.addEventListener('pointerdown',outside);window.addEventListener('resize',resize);
    return()=>{document.removeEventListener('keydown',escape);document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',resize);};
  },[open]);
  const close=()=>setOpen(false);
  return <header className="home-nav"><Brand/><nav className="home-desktop-nav" aria-label="Main navigation"><a href="#features">Capabilities</a><a href="#inside">Inside NOX</a><a href="#about">The small print</a></nav><a className="home-nav-action" href="/app" data-greet>Enter the laboratory <Arrow/></a><button ref={toggle} className="home-menu-toggle" aria-label={open?'Close navigation':'Open navigation'} aria-expanded={open} aria-controls="home-mobile-menu" onClick={()=>setOpen(v=>!v)}>{open?'Close':'Menu'} <span aria-hidden="true">{open?'−':'+'}</span></button><AnimatePresence>{open&&<motion.nav ref={menu} id="home-mobile-menu" className="home-mobile-menu" aria-label="Mobile navigation" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={panelTransition}><a onClick={close} href="#features">Capabilities <span>01</span></a><a onClick={close} href="#inside">Inside NOX <span>02</span></a><a onClick={close} href="#about">The small print <span>03</span></a><a onClick={close} href="/app">Enter the laboratory <Arrow/></a></motion.nav>}</AnimatePresence></header>;
}

function Sculpture(){
  const host=useRef(null),scene=useRef(null),pointer=useRef(null),pose=useRef({x:0,y:0}),[status,setStatus]=useState('loading');
  const reduced=useReducedMotion();
  const [,api]=useSpring(()=>({x:0,y:0,config:{mass:1,tension:160,friction:26},onChange:result=>{pose.current=result.value;scene.current?.setRotation(result.value.x,result.value.y);host.current?.style.setProperty('--fallback-turn',`${result.value.y*35}deg`);}}));
  useEffect(()=>{
    let cancelled=false,started=false,visibleNow=true;
    const observer=new IntersectionObserver(entries=>{
      const visible=entries[0].isIntersecting;
      visibleNow=visible;
      scene.current?.setVisible(visible);
      if(!visible||started)return;started=true;
      import('./sculpture.js').then(({createSculpture})=>{
        if(cancelled)return;
        try{scene.current=createSculpture(host.current);scene.current.setVisible(visibleNow);scene.current.setRotation(pose.current.x,pose.current.y);setStatus('ready');}
        catch{setStatus('fallback');}
      }).catch(()=>{if(!cancelled)setStatus('fallback');});
    },{rootMargin:'80px'});
    observer.observe(host.current);
    return()=>{cancelled=true;observer.disconnect();scene.current?.dispose();scene.current=null;};
  },[]);
  useEffect(()=>{if(reduced)api.start({x:0,y:0,immediate:true});},[reduced,api]);
  const point=e=>{
    if(reduced||e.pointerType==='touch')return;
    const box=host.current.getBoundingClientRect();
    if(pointer.current){
      if(e.pointerId!==pointer.current.id)return;
      api.start({x:clamp(pointer.current.x+(e.clientY-pointer.current.py)*.003,-.32,.32),y:clamp(pointer.current.y+(e.clientX-pointer.current.px)*.003,-.44,.44)});
    }else api.start({x:clamp((e.clientY-box.top)/box.height-.5,-.5,.5)*.2,y:clamp((e.clientX-box.left)/box.width-.5,-.5,.5)*.3});
  };
  const down=e=>{
    if(reduced||e.pointerType==='touch'||e.target.closest('#landing-stage,.sculpture-controls'))return;
    if(e.button!==0)return;
    pointer.current={id:e.pointerId,px:e.clientX,py:e.clientY,x:pose.current.x,y:pose.current.y};host.current.setPointerCapture(e.pointerId);host.current.dataset.dragging='true';
  };
  const release=e=>{
    if(!pointer.current||e.pointerId!==pointer.current.id)return;
    pointer.current=null;host.current.dataset.dragging='false';api.start({x:0,y:0});
  };
  const turn=n=>api.start({x:0,y:clamp(pose.current.y+n,-.44,.44),immediate:Boolean(reduced)});
  return <div className="hero-object-scroll"><div className="hero-object" ref={host} data-scene={status} onPointerMove={point} onPointerDown={down} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onPointerLeave={()=>{if(!pointer.current&&!reduced)api.start({x:0,y:0});}}>
    <div className="sculpture-fallback" aria-hidden="true"><i/><i/><i/><i/></div>
    <div className="sculpture-canvas" aria-hidden="true"/>
    <div className="presence-frame"><canvas id="landing-stage" aria-label="NOX, your live companion. Click to make him smile, drag to pick him up, use arrow keys to move him and Space to wink." tabIndex="0"/></div>
    <span className="sculpture-coordinate coordinate-top">01 — PRESENCE</span><span className="sculpture-coordinate coordinate-bottom">CONTEXT / IMAGINATION / EXPRESSION</span>
    <div className="sculpture-controls" aria-label="Rotate the 3D sculpture"><button onClick={()=>turn(-.12)} aria-label="Rotate sculpture left">←</button><button onClick={()=>api.start({x:0,y:0,immediate:Boolean(reduced)})}>Reset view</button><button onClick={()=>turn(.12)} aria-label="Rotate sculpture right">→</button></div>
    <p className="sculpture-instruction">{status==='fallback'?'A quieter view. NOX is still here.':'Move your cursor. He noticed.'}</p>
  </div></div>;
}

const demonstrations=[
  {id:'think',label:'Think together',number:'01',title:'An idea deserves a second mind.',description:'Ask a question. Pick a quick answer or take a deeper detour. Connected models generate fresh replies; your saved conversations let you return to the thread.',lines:[['YOU','What makes a good opening for a short?'],['NOX','Start with something the viewer needs to resolve. Give me your idea; we’ll find the question inside it.']],href:'/app#conversation',action:'Start a conversation'},
  {id:'make',label:'Make a scene',number:'02',title:'A character with a little agency.',description:'Pick him up. Let gravity do its thing. Catch a shy look, a dizzy spiral, or the rare big-eyed protest. Scene programs, a local camera preview and recording give him a place in your frame.',lines:[['INPUT','Drag. Shake. Release.'],['RESPONSE','Held → dizzy → falling → ouch → content.']],href:'/app#scenes',action:'Open scene studio'},
  {id:'remember',label:'Bring context',number:'03',title:'Keep the useful parts close.',description:'A local knowledge notebook retrieves relevant excerpts from your notes. Conversation summaries keep older context compact. You choose what to remember and what to remove.',lines:[['YOUR NOTE','The opening should be curious, with a quiet reveal.'],['CONTEXT','Relevant excerpts accompany your question. Your original notes stay in this browser.']],href:'/app#library',action:'Visit your library'},
];
function Demonstrator(){
  const [active,setActive]=useState('think'),item=demonstrations.find(x=>x.id===active),tabs=useRef([]),reduced=useReducedMotion();
  const select=(index,focus=false)=>{setActive(demonstrations[index].id);if(focus)tabs.current[index]?.focus();};
  const key=(e,index)=>{const delta=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(delta){e.preventDefault();select((index+delta+3)%3,true);}if(e.key==='Home'||e.key==='End'){e.preventDefault();select(e.key==='Home'?0:2,true);}};
  return <section className="home-section home-demonstrator" id="features" data-reveal><div className="home-section-heading"><p className="home-kicker">01 / WHAT YOU CAN DO</p><h2>A place to think.<br/>A reason to play.</h2><p>Good conversation. Small surprises.<br/>Tools that make both useful.</p></div><div className="demo-tabs" role="tablist" aria-label="Explore NOX capabilities">{demonstrations.map((x,i)=><button ref={el=>tabs.current[i]=el} key={x.id} id={`tab-${x.id}`} role="tab" aria-selected={active===x.id} aria-controls={`demo-${x.id}`} tabIndex={active===x.id?0:-1} onKeyDown={e=>key(e,i)} onClick={()=>select(i)}><span>{x.number}</span>{x.label}<span aria-hidden="true">{active===x.id?'↗':'+'}</span></button>)}</div><div className="demo-panel-shell"><AnimatePresence mode="wait" initial={false}><motion.div key={item.id} role="tabpanel" id={`demo-${item.id}`} aria-labelledby={`tab-${item.id}`} tabIndex={0} className="demo-panel" initial={{opacity:0,y:reduced?0:7}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:-5}} transition={panelTransition}><div className="demo-copy"><span className="demo-number">/ {item.number}</span><h3>{item.title}</h3><p>{item.description}</p><a className="home-text-link" href={item.href}>{item.action} <Arrow/></a></div><div className="demo-example"><p className="example-label">ILLUSTRATIVE EXAMPLE</p>{item.lines.map(([speaker,text])=><div className="demo-line" key={speaker}><span>{speaker}</span><p>{text}</p></div>)}<div className="demo-example-foot"><i aria-hidden="true"/><span>Explore it in the workspace</span><Arrow/></div></div></motion.div></AnimatePresence></div></section>;
}

function Home(){
  const root=useRef(null),reduced=useReducedMotion();
  useEffect(()=>{const themeChange=event=>{if(event.key==='nox.theme.v1')applySavedTheme();};window.addEventListener('storage',themeChange);return()=>window.removeEventListener('storage',themeChange);},[]);
  useEffect(()=>{let disposed=false;import('/js/landing.js').catch(()=>{if(!disposed)document.getElementById('landing-stage')?.setAttribute('aria-label','The live character is unavailable. Open the workspace to meet NOX.');});return()=>{disposed=true;};},[]);
  useEffect(()=>{
    const mm=gsap.matchMedia(),media='(min-width: 761px) and (prefers-reduced-motion: no-preference) and (pointer: fine)';
    const context=gsap.context(()=>{
      if(!reduced){gsap.from('.hero-enter',{y:24,opacity:0,duration:.85,ease:'power3.out',stagger:.09,clearProps:'transform,opacity'});gsap.utils.toArray('[data-reveal]').forEach(el=>gsap.from(el,{y:24,opacity:0,duration:.7,ease:'power2.out',scrollTrigger:{trigger:el,start:'top 88%',once:true},clearProps:'transform,opacity'}));}
      mm.add(media,()=>{
        const lenis=new Lenis({duration:.95,smoothWheel:true,syncTouch:false,anchors:true});
        lenis.on('scroll',ScrollTrigger.update);const tick=time=>lenis.raf(time*1000);gsap.ticker.add(tick);gsap.ticker.lagSmoothing(0);
        gsap.to('.hero-object-scroll',{y:60,rotation:2,ease:'none',scrollTrigger:{trigger:'.home-hero',start:'top top',end:'bottom top',scrub:true}});
        return()=>{gsap.ticker.remove(tick);lenis.destroy();};
      });
    },root);
    return()=>{mm.revert();context.revert();};
  },[reduced]);
  return <div ref={root} className="home-page"><a className="home-skip" href="#main">Skip to content</a><Header/><main id="main"><section className="home-hero" id="home"><div className="hero-copy"><p className="home-kicker hero-enter"><span className="signal-dot"/> A CURIOUS PRESENCE. BUILT TO EXPLORE.</p><h1 className="hero-enter">A small presence.<br/>A wider<br/><em>imagination.</em></h1><p className="hero-description hero-enter">Meet NOX. A curious AI companion for thinking out loud, making something strange, and finding the next good idea.</p><div className="home-hero-actions hero-enter"><a href="/app#conversation" className="home-primary" data-greet>Meet your companion <Arrow/></a><a href="#features" className="home-secondary">Take a closer look <span aria-hidden="true">↓</span></a></div><p className="hero-fineprint hero-enter">Expressive by design. Yours to direct.</p></div><Sculpture/></section><div className="home-hero-baseline"><span>NOX / THE COMPANION LABORATORY</span><a href="#features">A little further ↓</a><span>MODEL POWER. CHARACTER FIRST.</span></div><Demonstrator/><section className="home-section home-inside" id="inside" data-reveal><div className="inside-heading"><p className="home-kicker">02 / INSIDE THE LITTLE GUY</p><h2>Many layers.<br/>One familiar face.</h2><p>Presence, context and generation work together. Each layer has a job. You stay in control.</p><a className="home-text-link" href="/app#conversation">Find his personality <Arrow/></a></div><ol className="inside-layers"><li><span>01</span><div><h3>Presence</h3><p>Cursor attention, gestures and expressions run in your browser. Small reactions feel immediate.</p></div><b>LOCAL</b></li><li><span>02</span><div><h3>Context</h3><p>Your current conversation, optional memory and relevant notebook excerpts give the model something useful to work with.</p></div><b>YOU CHOOSE</b></li><li><span>03</span><div><h3>Generation</h3><p>Groq powers connected conversation. NVIDIA and Google adapters are available when their server-side keys are configured.</p></div><b>CONNECTED</b></li><li><span>04</span><div><h3>Expression</h3><p>Validated replies guide his mood and scene. Voice playback drives his mouth, including the pauses.</p></div><b>IN THE FRAME</b></li></ol></section><section className="home-quote" data-reveal><p className="home-kicker">SMALL IN SIZE. GENEROUS IN POSSIBILITY.</p><p className="quote-text">The next interesting thing<br/>usually starts with <em>“what if?”</em></p><a className="home-primary" href="/app#explore" data-greet>Find your next idea <Arrow/></a></section><section className="home-section home-about" id="about" data-reveal><div><p className="home-kicker">03 / THE SMALL PRINT</p><h2>Trust starts<br/>with clarity.</h2></div><div className="about-notes"><article><h3>A character, with a model behind him.</h3><p>NOX is a fictional AI companion. His replies can be mistaken; his personality is designed. Connected conversation needs owner access. You can explore his gestures and scenes without it.</p></article><article><h3>Your browser is your notebook.</h3><p>Saved chats, notes and preferences stay in this browser. The context you send goes to your selected model provider. Camera preview and recordings are processed locally. There is no cloud sync.</p></article><article><h3>Free plans have real limits.</h3><p>The app supports free provider tiers. Their availability, quotas and model terms apply. You choose answer depth and voice to balance detail, speed and usage.</p></article></div></section></main><footer className="home-footer"><Brand/><p>A curious mind. A little company.</p><a href="/app">Open workspace <Arrow/></a></footer><div id="nox-peek" className="nox-peek" aria-hidden="true" hidden><canvas id="peek-stage"/></div></div>;
}

createRoot(document.getElementById('home-root')).render(<MotionConfig reducedMotion="user"><Home/></MotionConfig>);
