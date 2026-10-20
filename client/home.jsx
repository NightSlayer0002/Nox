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
import {HoldButton} from './hold-button.jsx';
import {SourceBoundary} from './source-boundary.jsx';
import {sourceTypography,sourcePinnedTypography} from './codrops-scroll.js';
import {ScrollTitle} from './scroll-title.jsx';
import {createLanding} from '/js/landing.js';
import {emblemPose} from '/js/home-choreography.js';
import {sourceWorldScroll} from './home-scroll.js';
import {readTheme,applyTheme} from '/js/preferences.js';
const SourceScene=lazy(()=>import('./source-scene.jsx'));
const SourceLogo=lazy(()=>import('./source-logo.jsx'));
const CinematicScene=lazy(()=>import('./cinematic-scene.jsx'));
gsap.registerPlugin(ScrollTrigger);applyTheme(readTheme());
const scenes=[['home','First contact'],['features','Explore together'],['inside','Change matter'],['about','Play together']];
const reactions={neutral:'He’s watching.',curious:'Curiosity: mutual.',happy:'Okay. You’re forgiven.',shy:'Personal space? Never heard of it.',surprised:'Where are we going?',worried:'You can put me down now.',dizzy:'The room is still moving.',annoyed:'The fourth poke was a choice.',pout:'A tiny, spectacular protest.',ouch:'Gravity makes a point.',content:'Found my footing.',sleepy:'Still here. Just recharging.',yawning:'Long day in the browser.',mischievous:'I’ll take it from here.'};

function Home(){
  const root=useRef(),actor=useRef(),peekHost=useRef(),peekCanvas=useRef(),controller=useRef();
  const logoPose=useRef(emblemPose(0,[0,1,2,3,4],matchMedia('(max-width:700px)').matches)),matter=useRef({hold:0,metal:false});
  const material=useRef(false);
  const [source,setSource]=useState(null),[menu,setMenu]=useState(false),[metal,setMetal]=useState(false),[chapter,setChapter]=useState(0),[notice,setNotice]=useState('Move your cursor. He already noticed.'),[ready,setReady]=useState(false);
  const connect=useCallback(canvas=>setSource(canvas),[]);
  const refreshFinale=useCallback(()=>{ScrollTrigger.refresh();ScrollTrigger.update();},[]);
  useEffect(()=>{
    const landing=createLanding(actor.current,{
      onExpression:expression=>{if(reactions[expression])setNotice(reactions[expression]);},
      peekHost:peekHost.current,peekCanvas:peekCanvas.current
    });controller.current=landing;setReady(true);document.documentElement.dataset.homeReady='true';
    const lenis=new Lenis({duration:.68,anchors:true,smoothWheel:true,syncTouch:false,prevent:node=>node.closest?.('dialog,textarea,select')});
    lenis.on('scroll',ScrollTrigger.update);const tick=time=>lenis.raf(time*1000);gsap.ticker.add(tick);gsap.ticker.lagSmoothing(0);
    const context=gsap.context(()=>{
      gsap.from('.contact-intro > *',{opacity:0,y:16,duration:.55,stagger:.055,ease:'power2.out',clearProps:'all'});
      sourceTypography(root.current,gsap);
      const mm=gsap.matchMedia();
      mm.add({small:'(max-width:700px)',wide:'(min-width:701px)'},({conditions})=>{
        const small=conditions.small;
        sourcePinnedTypography(root.current,gsap,small);
        sourceWorldScroll(root.current,gsap,ScrollTrigger,logoPose.current,small,setChapter);
      });
      ScrollTrigger.refresh();
    },root);
    // React creates the chapters after the browser's initial fragment lookup.
    // Restore that entry after the pinned layout and Lenis are ready.
    const entryFrame=requestAnimationFrame(()=>{
      const id=location.hash.slice(1);
      if(scenes.some(([key])=>key===id)){lenis.scrollTo(document.getElementById(id),{immediate:true});ScrollTrigger.update();}
    });
    return()=>{cancelAnimationFrame(entryFrame);context.revert();gsap.ticker.remove(tick);lenis.destroy();landing.dispose();controller.current=null;};
  },[]);
  const toggleMaterial=()=>{material.current=!material.current;matter.current.metal=material.current;controller.current?.material(material.current);setMetal(material.current);};
  const pressMaterial=useCallback(progress=>{matter.current.hold=progress;if(progress>0&&!material.current)controller.current?.stage.prepareLiquid();},[]);
  const greet=useCallback(()=>{matter.current.pokeAt=performance.now();controller.current?.poke();},[]);
  return <div ref={root} className="home-page contact-page"><a className="skip-link" href="#main">Skip to content</a>
    <div className="contact-world" aria-hidden="true"><div className="contact-water"><SourceBoundary><Suspense fallback={<div className="source-fallback"/>}><SourceScene onCanvas={connect} pose={logoPose.current}/></Suspense></SourceBoundary></div></div>
    <div className="contact-emblem"><SourceBoundary fallback={<div className="logo-static"><img src="/icon.svg" alt=""/></div>}><Suspense fallback={<div className="logo-static"><img src="/icon.svg" alt=""/></div>}><SourceLogo pose={logoPose.current} matter={matter.current} onPoke={greet}/></Suspense></SourceBoundary></div>
    <header className="contact-nav">
      <a className="brand" href="/" aria-label="NOX home"><img src="/icon.svg" alt=""/><span>NOX</span></a>
      <nav className="home-links" aria-label="Main navigation"><a href="#features">Explore</a><a className="nav-enter" href="/guest#conversation">Try NOX</a></nav>
      <button className="mobile-menu" onClick={()=>setMenu(!menu)} aria-expanded={menu} aria-controls="home-menu" aria-label="Toggle navigation">Menu</button>
      <AnimatePresence>{menu&&<motion.nav id="home-menu" className="mobile-nav" initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} onKeyDown={event=>{if(event.key==='Escape'){setMenu(false);root.current.querySelector('.mobile-menu')?.focus();}}}><a href="#features" onClick={()=>setMenu(false)}>Explore</a><a href="#inside" onClick={()=>setMenu(false)}>Liquid metal</a><a href="#about" onClick={()=>setMenu(false)}>Play</a><a href="/guest#conversation">Try NOX</a></motion.nav>}</AnimatePresence>
    </header>
    <main id="main">
      <section id="home" className="contact-chapter"><div className="contact-copy contact-intro"><h1>A little intelligence<br/>of your own.</h1><p className="contact-description">Talk things through, understand something new, or play a little. NOX is your expressive, everyday AI companion.</p><div className="hero-actions"><LiquidButton href="/guest#conversation" source={source}>Try NOX</LiquidButton></div><p className="hero-instruction">Move your cursor. He’s already looking.</p></div><div className="hero-visual"><div className="mascot-room"><canvas ref={actor} id="landing-stage" tabIndex="0" aria-label="NOX in his fixed home spot. Move your cursor for his gaze, click to greet, double-click or press Space to wink."/></div></div></section>
      <section id="features" className="contact-chapter"><div className="contact-copy"><ScrollTitle text={"Bring your\ncuriosity."}/><p className="contact-description">Why does the Moon change shape? Explore the example with NOX, ask for a clue, then try explaining it yourself.</p><div className="contact-actions"><a className="nav-enter" href="/guest#learn">Explore the Moon</a><button onClick={greet} disabled={!ready}>Say hello</button></div></div></section>
      <section id="inside" className="contact-chapter"><div className="contact-copy"><ScrollTitle pinned text={"Same NOX.\nNew surface."}/><p className="contact-description">From a soft little blob to flowing chrome.<br/>Still him. Just a different state of matter.</p><HoldButton source={source} metal={metal} onProgress={pressMaterial} onComplete={toggleMaterial} disabled={!ready}/><p id="material-help" className="material-help">Hold to change. Enter or Space switches instantly.</p></div></section>
      <section id="about" className="contact-chapter"><div className="contact-copy"><ScrollTitle text={"Play it\nyour way."}/><p className="contact-description">Follow a little mystery or try a guessing game. NOX joins in; you choose when to pause or keep going.</p><div className="hero-actions"><LiquidButton href="/guest#afterimage" source={source}>Start a mystery</LiquidButton><a className="wander-link" href="/guest#guessing">Try a guessing game</a></div></div></section>
      <section className="contact-details" aria-labelledby="details-title"><h2 id="details-title">A little time together.</h2><p className="detail-intro">No account needed for the preview. Talk, explore, and play with NOX. Guest conversations and activities clear when you refresh.</p><div className="hero-actions"><LiquidButton href="/guest#conversation" source={source}>Try NOX</LiquidButton><a className="wander-link" href="/guest#access">See Free &amp; Plus</a></div><details className="home-privacy"><summary>Privacy and access</summary><div className="detail-columns"><article><h3>Your preferences, this visit</h3><p>NOX asks before applying supported preferences. View, change or remove them during your visit. Guest preferences, chats, and notes clear on refresh. You can export a conversation or story as a file.</p></article><article><h3>Free, with clear limits</h3><p>NOX Free includes complete answers, learning and play during your visit. Chat and natural voice have separate allowances. NOX Plus is planned and is not on sale.</p></article><article><h3>A connected companion</h3><p>Relevant conversation and approved context go to AI providers; enabled natural voice uses a speech provider. Live AI needs an internet connection. Camera previews and recordings stay local. AI can make mistakes.</p></article></div><a href="/guest#memory">Your preferences</a></details></section>
      <SourceBoundary fallback={<div className="cinematic-section" aria-hidden="true"/>}><Suspense fallback={<div className="cinematic-section" aria-hidden="true"/>}><CinematicScene landing={ready?controller.current:null} onLayout={refreshFinale}/></Suspense></SourceBoundary>
    </main>
    <div className="contact-hud"><p className="hud-presence" aria-live="polite">{notice}</p></div>
    <div ref={peekHost} id="nox-peek" className="nox-peek" aria-hidden="true" hidden><canvas ref={peekCanvas} id="peek-stage"/></div>
    <footer className="source-footer"><span>NOX</span><a href="/guest#discover">Discover NOX</a><a href="/guest#access">Free &amp; Plus</a><a href="/owner#conversation">Developer access</a></footer>
  </div>;
}
createRoot(document.getElementById('home-root')).render(<MotionConfig reducedMotion="user"><Home/></MotionConfig>);
