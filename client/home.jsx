// Fullscreen content/typography: Codrops OnScrollTypographyAnimations.
// Public fluid world: ShaderGradient Mint/Pensive, rendered with R3F.
// Semantic controls and NOX interactions are integration code, not upstream art.
import React,{Suspense,lazy,useCallback,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {gsap} from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import {AnimatePresence,motion,MotionConfig} from 'motion/react';
import {LiquidButton} from './liquid-button.jsx';
import {SourceBoundary} from './source-boundary.jsx';
import {sourceTypography} from './codrops-scroll.js';
import {ScrollTitle} from './scroll-title.jsx';
import {createLanding} from '/js/landing.js';
import {createDiscoveries} from '/js/first-contact.js';
import {readTheme,applyTheme} from '/js/preferences.js';
const SourceScene=lazy(()=>import('./source-scene.jsx'));
gsap.registerPlugin(ScrollTrigger);applyTheme(readTheme());
const scenes=[['home','First contact'],['features','Play a little'],['inside','Change matter'],['about','Make something']];
const reactions={neutral:'He’s watching.',curious:'Curiosity: mutual.',happy:'Okay. You’re forgiven.',shy:'Personal space? Never heard of it.',surprised:'Where are we going?',worried:'You can put me down now.',dizzy:'The room is still moving.',annoyed:'The fourth poke was a choice.',pout:'A tiny, spectacular protest.',ouch:'Gravity makes a point.',content:'Found my footing.',sleepy:'Still here. Just recharging.',yawning:'Long day in the browser.',mischievous:'I’ll take it from here.'};
const discoveries={poke:'First hello',drag:'Picked him up',shake:'Spiral eyes',liquid:'Liquid NOX',gravity:'A little gravity',takeover:'Scene stealer',pout:'Rare tiny protest'};

function Home(){
  const root=useRef(),actor=useRef(),controller=useRef(),found=useRef(createDiscoveries());
  const [source,setSource]=useState(null),[menu,setMenu]=useState(false),[metal,setMetal]=useState(false),[chapter,setChapter]=useState(0),[count,setCount]=useState(0),[notice,setNotice]=useState('Move your cursor. He already noticed.'),[scene,setScene]=useState('none'),[ready,setReady]=useState(false);
  const connect=useCallback(canvas=>setSource(canvas),[]);
  useEffect(()=>{
    const landing=createLanding(actor.current,{
      onDiscover:kind=>{if(found.current.mark(kind)){setCount(found.current.count);setNotice(`Discovered / ${discoveries[kind]}`);}},
      onExpression:expression=>{if(reactions[expression])setNotice(reactions[expression]);},
      onScene:setScene
    });controller.current=landing;setReady(true);document.documentElement.dataset.homeReady='true';
    const lenis=new Lenis({duration:1.05,anchors:true,smoothWheel:true,syncTouch:false,prevent:node=>node.closest?.('dialog,textarea,select')});
    lenis.on('scroll',ScrollTrigger.update);const tick=time=>lenis.raf(time*1000);gsap.ticker.add(tick);gsap.ticker.lagSmoothing(0);
    const context=gsap.context(()=>{
      gsap.from('.contact-intro > *',{opacity:0,y:24,duration:.9,stagger:.08,ease:'power2.out',clearProps:'all'});
      sourceTypography(root.current,gsap);
      const mm=gsap.matchMedia();
      mm.add({small:'(max-width:700px)',wide:'(min-width:701px)'},({conditions})=>{
        const small=conditions.small;
        const poses=small?[{x:.5,y:.7,size:.57},{x:.5,y:.7,size:.53},{x:.5,y:.7,size:.58},{x:.5,y:.7,size:.5}]:[{x:.7,y:.54,size:.34},{x:.72,y:.49,size:.31},{x:.71,y:.51,size:.34},{x:.72,y:.49,size:.29}];
        Object.assign(landing.pose,poses[0]);landing.stage.character.x=poses[0].x;landing.stage.character.y=poses[0].y;
        scenes.forEach(([id],index)=>{
          const section=document.getElementById(id);
          ScrollTrigger.create({trigger:section,start:'top 50%',end:'bottom 50%',onToggle:self=>{if(self.isActive){setChapter(index);landing.chapter();gsap.to(landing.pose,{...poses[index],duration:1.1,ease:'power2.inOut',overwrite:true});}}});
        });
        gsap.to('.contact-sculpture',{rotation:small?70:140,scale:1.22,yPercent:-20,ease:'none',scrollTrigger:{trigger:root.current,start:'top top',end:'bottom bottom',scrub:1}});
        gsap.to(landing.pose,{x:small?.86:.92,y:.86,size:small?.26:.09,ease:'none',scrollTrigger:{trigger:'.contact-details',start:'top 85%',end:'top 35%',scrub:1,onEnter:()=>landing.chapter(),onLeaveBack:()=>landing.chapter()}});
      });
    },root);
    return()=>{context.revert();gsap.ticker.remove(tick);lenis.destroy();landing.dispose();controller.current=null;};
  },[]);
  const act=action=>controller.current?.run(action);
  const toggleMaterial=()=>{setMetal(value=>{controller.current?.material(!value);return !value;});};
  return <div ref={root} className="home-page contact-page"><a className="skip-link" href="#main">Skip to content</a>
    <div className="contact-world" aria-hidden="true"><div className="contact-water"><SourceBoundary><Suspense fallback={<div className="source-fallback"/>}><SourceScene onCanvas={connect}/></Suspense></SourceBoundary></div><div className="contact-sculpture"><SourceBoundary><Suspense fallback={<div className="source-fallback"/>}><SourceScene variant="sphere" interactive/></Suspense></SourceBoundary></div></div>
    <canvas ref={actor} id="landing-stage" tabIndex="0" aria-label="Interactive NOX. Poke or drag him, shake for spiral eyes. Keyboard: arrow keys to move, Space to greet."/>
    <header className="contact-nav"><a className="brand" href="/" aria-label="NOX home"><img src="/icon.svg" alt=""/><span>NOX</span></a><span className="contact-coordinate">A CURIOUS LITTLE WORLD / 001</span><a className="nav-enter" href="/app#conversation">Enter workspace <span aria-hidden="true">↗</span></a><button className="mobile-menu" onClick={()=>setMenu(!menu)} aria-expanded={menu} aria-label="Toggle navigation">☰</button><AnimatePresence>{menu&&<motion.nav className="mobile-nav glass-container" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}><a href="#features" onClick={()=>setMenu(false)}>Play a little</a><a href="#inside" onClick={()=>setMenu(false)}>Change matter</a><a href="#about" onClick={()=>setMenu(false)}>Make something</a><a href="/app#conversation">Skip to chat ↗</a></motion.nav>}</AnimatePresence></header>
    <nav className="scene-map" aria-label="Scene map">{scenes.map(([id,label],index)=><a key={id} href={`#${id}`} aria-label={`0${index+1} ${label}`} aria-current={chapter===index?'step':undefined}><span className="scene-number">0{index+1}</span><span className="scene-label">{label}</span></a>)}</nav>
    <main id="main">
      <section id="home" className="contact-chapter"><div className="contact-copy contact-intro"><p className="eyebrow">01 / FIRST CONTACT</p><h1>Oh.<br/>You’re here.</h1><p className="contact-description">Meet NOX. Small face, strong opinions.<br/>An AI companion you can think and make with.</p><LiquidButton href="/app#conversation" source={source}>Talk to the little guy <span aria-hidden="true">↗</span></LiquidButton><a className="wander-link" href="#features">Or stay. There’s more to him. ↓</a></div><div className="chapter-margin"><span>NO INTRO REQUIRED</span><p>Move your cursor.<br/>He’s paying attention.</p></div></section>
      <section id="features" className="contact-chapter"><div className="contact-copy"><p className="eyebrow">02 / CAUSE A LITTLE TROUBLE</p><ScrollTitle text={"Soft outside.\nDrama inside."}/><p className="contact-description">Pick him up. Put him down. Poke him again.<br/>He has a face for all of it.</p><div className="contact-actions"><button onClick={()=>controller.current?.poke()} disabled={!ready}>Say hello ↗</button><button onClick={()=>act('gravity')} aria-pressed={scene==='gravity'} disabled={!ready}>Gravity {scene==='gravity'?'on':'off'}</button><button onClick={()=>controller.current?.home()} disabled={!ready}>Bring him back</button></div><p className="experiment-note">Local play. No AI key needed.<br/>On touch, try a sideways drag. Arrows + Space work too.</p></div><div className="chapter-margin"><span>PLEASE HANDLE WITH CURIOSITY</span><p>Shake for spirals.<br/>Spam pokes at your own risk.</p></div></section>
      <section id="inside" className="contact-chapter"><div className="contact-copy"><p className="eyebrow">03 / A CHANGE OF MATTER</p><ScrollTitle text={"Same soul.*\nNew surface."}/><p className="contact-description">From soft little blob to flowing chrome.<br/>The face, the reactions, the NOX stay.</p><LiquidButton className="material-control" source={source} pressed={metal} onClick={toggleMaterial}>{metal?'Return to soft NOX':'Make him liquid'} <span aria-hidden="true">↔</span></LiquidButton><p className="experiment-note">*Character, technically. He’s fictional.<br/>The liquid is a live shader from liquid-logo.</p></div><div className="chapter-margin"><span>MATTER / {metal?'LIQUID':'SOFT'}</span><p>Still looking.<br/>Just shinier.</p></div></section>
      <section id="about" className="contact-chapter"><div className="contact-copy"><p className="eyebrow">04 / NOW MAKE SOMETHING</p><ScrollTitle text={"A curious mind.\nA co-conspirator."}/><p className="contact-description">Talk through an idea. Build a scene.<br/>Turn a strange thought into something worth sharing.</p><LiquidButton href="/app#conversation" source={source}>Start your conversation <span aria-hidden="true">↗</span></LiquidButton><div className="workspace-paths"><a href="/app#scenes">Frame & play ↗</a><a href="/app#library">Your saved threads ↗</a><a href="/app#explore">Find an idea ↗</a></div></div><div className="chapter-margin"><span>YOUR TURN</span><p>Something strange<br/>could start here.</p></div></section>
      <section className="contact-details" aria-labelledby="details-title"><p className="eyebrow">THE LITTLE PRINT</p><h2 id="details-title">A character with a real connection.</h2><div className="detail-columns"><article><h3>Context becomes conversation.</h3><p>Groq powers connected replies after owner access is unlocked. Optional memory and relevant notebook excerpts add context. NVIDIA and Google work when their server keys are configured. AI can be wrong.</p></article><article><h3>Your browser is your notebook.</h3><p>Chats, notes and preferences stay here, without cloud sync. Selected context goes to the model provider. Camera preview and recordings stay local. Free services have quotas and terms.</p></article></div><div className="source-credits"><span>OPEN SOURCE / REAL EFFECTS</span><a href="https://github.com/collidingScopes/liquid-logo">liquid-logo ↗</a><a href="https://github.com/ruucm/shadergradient">ShaderGradient ↗</a><a href="https://github.com/dashersw/liquid-glass-js">Liquid Glass ↗</a><a href="https://github.com/pmndrs/react-three-fiber">React Three Fiber ↗</a><a href="https://github.com/Codrops/OnScrollTypographyAnimations">Codrops ↗</a><a href="https://github.com/darkroomengineering/lenis">Lenis ↗</a></div></section>
    </main>
    <div className="contact-hud"><div className="hud-presence"><span className="eyebrow">NOX / {ready?'PRESENT':'ARRIVING'}</span><p>{notice}</p></div><div className="hud-discoveries"><span>{String(count).padStart(2,'0')} / 07</span><span>discoveries this visit</span></div><a href={chapter<3?`#${scenes[chapter+1][0]}`:'/app#conversation'} className="scroll-cue">{chapter<3?'SCROLL TO WANDER ↓':'OPEN A NEW THREAD ↗'}</a></div>
    <footer className="source-footer"><span>NOX / FIRST CONTACT</span><span>A curious mind. A little company.</span><a href="/app#conversation">Skip to chat ↗</a></footer>
  </div>;
}
createRoot(document.getElementById('home-root')).render(<MotionConfig reducedMotion="user"><Home/></MotionConfig>);
