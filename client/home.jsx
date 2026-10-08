// Page / DemoPanel composition adapted from pmndrs/react-three-fiber/example.
// Fluid scene: ruucm/shadergradient's React example and Mint preset.
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
import {readTheme,applyTheme} from '/js/preferences.js';
const SourceScene=lazy(()=>import('./source-scene.jsx'));
gsap.registerPlugin(ScrollTrigger);applyTheme(readTheme());
const Page=({children,id,className='',...props})=><section {...props} className={`Page ${className}`} id={id}>{children}</section>;
function Home(){
  const root=useRef(),[source,setSource]=useState(null),[menu,setMenu]=useState(false),[metal,setMetal]=useState(false);
  const connect=useCallback(canvas=>setSource(canvas),[]);
  useEffect(()=>{let live=true;import('/js/landing.js').then(()=>{if(live)document.documentElement.dataset.homeReady='true';});return()=>{live=false;};},[]);
  useEffect(()=>{
    const lenis=new Lenis({duration:1.05,anchors:true,smoothWheel:true,syncTouch:false,prevent:node=>node.closest?.('dialog,textarea,select')});
    lenis.on('scroll',ScrollTrigger.update);const tick=time=>lenis.raf(time*1000);gsap.ticker.add(tick);gsap.ticker.lagSmoothing(0);
    const context=gsap.context(()=>{
      gsap.from('.hero-copy > *',{opacity:0,y:18,duration:.8,stagger:.09,ease:'power2.out',clearProps:'all'});
      gsap.to('.source-scroll',{scale:1.13,yPercent:-6,ease:'none',scrollTrigger:{trigger:root.current,start:'top top',end:'bottom bottom',scrub:1}});
      sourceTypography(root.current,gsap);
      gsap.utils.toArray('[data-chapter]').forEach(section=>gsap.from(section.querySelectorAll('.chapter-copy > :not(h2)'),{opacity:0,y:25,stagger:.08,duration:.6,scrollTrigger:{trigger:section,start:'top 75%',once:true},clearProps:'all'}));
    },root);
    return()=>{context.revert();gsap.ticker.remove(tick);lenis.destroy();};
  },[]);
  return <div ref={root} className="home-page source-home"><a className="skip-link" href="#main">Skip to content</a>
    <div className="source-scroll"><SourceBoundary><Suspense fallback={<div className="source-fallback"/>}><SourceScene onCanvas={connect}/></Suspense></SourceBoundary></div>
    <header className="source-nav glass-container"><a className="brand" href="/" aria-label="NOX home"><img src="/icon.svg" alt=""/><span>NOX</span></a><nav aria-label="Main"><a href="#features">Discover</a><a href="#inside">Inside NOX</a><a href="#about">The details</a></nav><a className="nav-enter" href="/app#conversation">Enter workspace ↗</a><button className="mobile-menu" onClick={()=>setMenu(!menu)} aria-expanded={menu} aria-label="Toggle navigation">☰</button><AnimatePresence>{menu&&<motion.nav className="mobile-nav glass-container" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}><a href="#features" onClick={()=>setMenu(false)}>Discover</a><a href="#inside" onClick={()=>setMenu(false)}>Inside NOX</a><a href="#about" onClick={()=>setMenu(false)}>The details</a><a href="/app">Enter workspace ↗</a></motion.nav>}</AnimatePresence></header>
    <main id="main"><Page id="home" className="home-hero"><div className="hero-copy"><p className="eyebrow">NOX / A CURIOUS PRESENCE</p><h1>A little guy.<br/>A world<br/>of possibility.</h1><p className="hero-description">Think out loud. Make something strange.<br/>Follow an idea with someone who has opinions.</p><LiquidButton href="/app#conversation" source={source}>Meet NOX <span aria-hidden="true">↗</span></LiquidButton><p className="fineprint">An expressive AI companion. A character of his own.</p></div><div className="hero-presence"><div className="hero-sphere"><SourceBoundary><Suspense fallback={<div className="source-fallback"/>}><SourceScene variant="sphere" interactive/></Suspense></SourceBoundary></div><canvas id="landing-stage" tabIndex="0" aria-label="Interactive NOX. Move your cursor, poke him, or drag him. Shake him gently for spiral eyes."/><div className="DemoPanel"><span>01 / PRESENCE</span><p>Yes, he’s looking at you.</p><a href="#features">Keep wandering ↓</a></div><LiquidButton className="hero-material" source={source} pressed={metal} onClick={()=>{const next=!metal;setMetal(next);document.dispatchEvent(new CustomEvent('nox:material',{detail:next?'liquid':'face'}));}}>{metal?'Back to soft NOX':'Try liquid metal'}</LiquidButton></div></Page>
    <Page id="features" className="feature-page" data-chapter><div className="chapter-copy"><p className="eyebrow">02 / WHAT SHALL WE MAKE?</p><ScrollTitle text={"More than\na reply."}/><p>A conversation can become an idea, a scene, or a story. Give NOX something to work with.</p><div className="source-links"><a href="/app#conversation"><b>A conversation</b><span>Ask. Question. Think further. ↗</span></a><a href="/app#scenes"><b>A little performance</b><span>Expressions, gravity, camera, clips. ↗</span></a><a href="/app#library"><b>A thread to return to</b><span>Saved conversations in your browser. ↗</span></a></div></div><div className="chapter-note"><span>CURIOUS / THOUGHTFUL / OPINIONATED</span><p>Small face.<br/>Room for big ideas.</p></div></Page>
    <Page id="inside" data-chapter><div className="chapter-copy"><p className="eyebrow">03 / INSIDE THE LITTLE MACHINE</p><ScrollTitle text={"Character outside.\nContext inside."}/><p>His reactions happen locally. A connected model gives him something new to say.</p><ol className="source-layers"><li><span>01</span><div><b>Presence</b><p>Cursor attention, gestures and expressions run in your browser.</p></div></li><li><span>02</span><div><b>Context</b><p>Conversation, optional memory and relevant notebook excerpts accompany your question.</p></div></li><li><span>03</span><div><b>Generation</b><p>Groq powers connected replies. NVIDIA and Google adapters work when their server keys are configured.</p></div></li><li><span>04</span><div><b>Expression</b><p>Validated replies guide his mood and scene. Voice playback drives his mouth, including pauses.</p></div></li></ol></div></Page>
    <Page id="about" data-chapter><div className="chapter-copy"><p className="eyebrow">04 / A LITTLE CLARITY</p><ScrollTitle text={"Your space.\nKnow its limits."}/><div className="source-links about-links"><article><h3>A fictional character, powered by AI.</h3><p>NOX can be wrong. Connected chat needs owner access. His local gestures and scenes are always available.</p></article><article><h3>Your browser is your notebook.</h3><p>Chats, notes and preferences stay here. Selected context goes to your model provider. Camera preview and recordings stay local. There is no cloud sync.</p></article><article><h3>Free services have limits.</h3><p>Provider quotas, model availability and terms apply. Choose answer depth and voice to balance detail, speed and usage.</p></article></div><a className="nav-enter" href="/app#explore">Find your next idea ↗</a></div><div className="chapter-note source-credits"><span>BUILT WITH OPEN SOURCE</span><a href="https://github.com/collidingScopes/liquid-logo">liquid-logo ↗</a><a href="https://github.com/ruucm/shadergradient">ShaderGradient ↗</a><a href="https://github.com/dashersw/liquid-glass-js">Liquid Glass ↗</a><a href="https://github.com/pmndrs/react-three-fiber">React Three Fiber ↗</a><a href="https://github.com/Codrops/OnScrollTypographyAnimations">Codrops scroll effects ↗</a><a href="https://github.com/darkroomengineering/lenis">Lenis ↗</a></div></Page></main>
    <footer className="source-footer"><a className="brand" href="/">NOX</a><span>A curious mind. A little company.</span><a href="/app">Open workspace ↗</a></footer><div id="nox-peek" className="nox-peek" aria-hidden="true" hidden><canvas id="peek-stage"/></div>
  </div>;
}
createRoot(document.getElementById('home-root')).render(<MotionConfig reducedMotion="user"><Home/></MotionConfig>);
