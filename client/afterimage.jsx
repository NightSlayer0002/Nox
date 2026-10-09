import React,{Suspense,lazy,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {AnimatePresence,motion} from 'motion/react';
import {normalizeAfterimage} from '../shared/afterimage.js';
import {afterimageBridge} from '/js/afterimage-bridge.js';
import {createAfterimageStore} from '/js/afterimage-store.js';
import {buildSelectedPerformance,toMarkdown} from '/js/afterimage-engine.js';
import {downloadText} from '/js/workbench.js';
import {FIRST_CONTACT} from './afterimage-example.js';
const Lattice=lazy(()=>import('./afterimage-lattice.jsx'));
let disk;try{disk=localStorage;}catch{/* The store supports temporary memory. */}
const store=createAfterimageStore(disk);
const example=normalizeAfterimage(FIRST_CONTACT);
const timecode=ms=>`${String(Math.floor(ms/1000/60)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
const tones=[['wonder','Wonder','A small impossible thing.'],['uncanny','Uncanny','Leave the light on.'],['bold','Bold','Break something interesting.']];

export default function Afterimage(){
  const [items,setItems]=useState(()=>store.list()),[current,setCurrent]=useState(()=>store.list()[0]||null),[seed,setSeed]=useState(()=>store.list()[0]?.seed||''),[tone,setTone]=useState(()=>store.list()[0]?.tone||'uncanny');
  const [view,setView]=useState(()=>afterimageBridge.snapshot()),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[editor,setEditor]=useState(false),[draftLines,setDraftLines]=useState([]);
  const request=useRef(null),version=useRef(0),variation=useRef(0);
  useEffect(()=>afterimageBridge.subscribe(()=>setView(afterimageBridge.snapshot())),[]);
  useEffect(()=>store.subscribe(()=>setItems(store.list())),[]);
  useEffect(()=>()=>{version.current++;request.current?.abort();afterimageBridge.stop('receiver closed');},[]);
  const packet=current?.packet||example,signalIndex=current?.signalIndex||0,endingIndex=current?.endingIndex||0,signal=packet.signals[signalIndex];
  const selected=buildSelectedPerformance(packet,signalIndex,endingIndex,current?.editedLines),playing=view.status==='playing',disabled=busy||playing;
  const reception=current||{packet:example,seed:'A door in a window with no wall.',tone:'uncanny',source:'authored',signalIndex:0,endingIndex:0,createdAt:new Date().toISOString()};
  const cancel=()=>{version.current++;request.current?.abort();request.current=null;setBusy(false);setNotice('Reception stopped. Your seed is still here.');};
  const choose=(which,index)=>{
    afterimageBridge.stop('selection changed');
    try{const base=current||store.add(reception);const next=store.update(base.id,{[which]:index});if(!next)throw new Error('This reception was removed. Choose another from your archive.');setCurrent(next);setEditor(false);setDraftLines([]);setNotice('A different cut. No new model request.');}catch(e){setError(e.message);}
  };
  async function receive(event,newTake=false){
    event?.preventDefault();if(!seed.trim()||busy||playing)return;
    const ownVersion=++version.current,controller=new AbortController();request.current=controller;setBusy(true);setError('');setNotice('NOX is composing three signals.');
    if(newTake)variation.current=(variation.current+1)%1025;
    try{
      const result=await afterimageBridge.receive({seed:seed.trim(),tone,variation:variation.current,signal:controller.signal});
      if(controller.signal.aborted||version.current!==ownVersion)return;
      const next=store.add({packet:result.packet,seed:seed.trim(),tone,source:'live',metrics:result.metrics});setCurrent(next);setEditor(false);setNotice('Three signals received. Six possible cuts.');
    }catch(e){if(version.current===ownVersion&&e.name!=='AbortError')setError(e.message||'The signal did not arrive. Your seed is still here.');}
    finally{if(version.current===ownVersion){request.current=null;setBusy(false);}}
  }
  function useExample(){cancel();afterimageBridge.stop('authored example');setCurrent(store.add({packet:example,seed:'A door in a window with no wall.',tone:'uncanny',source:'authored'}));setEditor(false);setError('');setNotice('First contact is an authored story. It uses no text-model quota.');}
  function play(capture=false){
    setError('');try{capture?afterimageBridge.recordAndPlay(packet,signalIndex,endingIndex,current?.editedLines):afterimageBridge.play(packet,signalIndex,endingIndex,current?.editedLines);setNotice(capture?'Capturing the stage locally. The exported WebM is silent.':'NOX is performing your selected cut.');if(window.innerWidth<=1200)document.getElementById('stage')?.scrollIntoView({behavior:'smooth',block:'center'});}catch(e){setError(e.message);}
  }
  function stopPerformance(){afterimageBridge.stop('stopped by you');setNotice('Performance stopped. Your reception is kept.');}
  function saveEdits(){
    try{const base=current||store.add(reception);const next=store.update(base.id,{editedLines:draftLines});if(!next)throw new Error('This reception was removed. Choose another from your archive.');setCurrent(next);setEditor(false);setDraftLines([]);setNotice('Your cut is edited. No model request.');}catch(e){setError(e.message);}
  }
  function restore(id){
    const item=store.get(id);if(!item){setError('This reception was removed from this browser.');return;}
    afterimageBridge.stop('archive selected');setCurrent(item);setSeed(item.seed);setTone(item.tone);setEditor(false);setDraftLines([]);setError('');setNotice('Reception restored. No model request.');
  }
  function remove(id){if(current?.id===id){afterimageBridge.stop('reception deleted');setCurrent(null);setEditor(false);setDraftLines([]);}store.remove(id);setNotice('Reception removed from this browser.');}
  const generated=current?.source==='live',metrics=current?.metrics;
  return <div className="afterimage-receiver">
    {createPortal(<AnimatePresence>{playing&&<motion.div className="receiver-onair" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:12}} transition={{duration:.18}}><span><i/>{view.recording?'CAPTURING':'ON AIR'} <b>{timecode(view.elapsedMs||0)} / 00:28</b></span><button type="button" onClick={stopPerformance}>End performance ■</button></motion.div>}</AnimatePresence>,document.body)}
    <div className="receiver-top"><span className="eyebrow">AFTERIMAGE / RECEIVER 01</span><span className={`receiver-state ${playing?'is-playing':''}`}><i/>{busy?'COMPOSING':playing?'PERFORMING':'READY'}</span></div>
    <h2>A transmission from<br/><em>a reality you haven’t made.</em></h2>
    <p className="receiver-intro">Plant a thought. Choose the impossible version. Let the little guy perform it.</p>
    <form className="receiver-form" onSubmit={receive} aria-busy={busy}>
      <label htmlFor="afterimage-seed">What should the signal begin with?</label>
      <textarea id="afterimage-seed" value={seed} onChange={e=>{setSeed(e.target.value);variation.current=0;}} maxLength={600} rows={2} placeholder="An abandoned elevator keeps arriving at my floor…" disabled={disabled}/>
      <div className="receiver-input-note"><span>Only this seed and tone go to your configured model.</span><span>{seed.length}/600</span></div>
      <div className="receiver-tones" role="group" aria-label="Transmission tone">{tones.map(([id,label,hint])=><button key={id} type="button" aria-pressed={tone===id} disabled={disabled} title={hint} onClick={()=>setTone(id)}>{label}</button>)}</div>
      <div className="receiver-form-actions"><button className="receive-button" type="submit" disabled={!seed.trim()||disabled||!view.connected}>{busy?'Receiving…':'Receive a signal ↗'}</button>{busy?<button type="button" onClick={cancel}>Cancel reception</button>:<button type="button" onClick={useExample} disabled={playing}>First contact · authored example</button>}</div>
      {view.connection?.kind==='locked'&&<p className="receiver-access">New signals need owner access. <button type="button" onClick={()=>document.getElementById('settings-button')?.click()}>Unlock in Preferences ↗</button> The authored example is ready to play.</p>}
    </form>
    {error&&<p className="receiver-error" role="alert">{error}</p>}<p className="receiver-notice" role="status">{notice||'Creative fiction. These are invented stories, not predictions.'}</p>
    <div className="reception-header"><span className="source-tag">{generated?'MODEL-GENERATED SIGNAL':'AUTHORED FIRST CONTACT'}</span><span>{current?new Date(current.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'NO AI REQUEST'}</span></div>
    <AnimatePresence mode="wait" initial={false}><motion.div key={current?.id||'first-contact'} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:.22}}>
      <h3 className="reception-title">{packet.title}</h3><p className="reception-anchor">{packet.anchor}</p>
      <Suspense fallback={<div className="lattice-loading">Opening the signal lattice…</div>}><Lattice packet={packet} signalIndex={signalIndex} endingIndex={endingIndex} onSignal={index=>choose('signalIndex',index)} onEnding={index=>choose('endingIndex',index)} playing={playing} disabled={disabled}/></Suspense>
      <div className="signal-choices" role="group" aria-label="Choose a signal">{packet.signals.map((item,index)=><button key={index} aria-pressed={signalIndex===index} disabled={disabled} onClick={()=>choose('signalIndex',index)}><span>0{index+1}</span><b>{item.label}</b></button>)}</div>
      <p className="signal-premise">{signal.premise}</p>
      <div className="ending-choices" role="group" aria-label="Choose an ending">{signal.endings.map((ending,index)=><button key={index} aria-pressed={endingIndex===index} disabled={disabled} onClick={()=>choose('endingIndex',index)}><span>{index===0?'A':'B'}</span>{ending.label}</button>)}</div>
      <div className="performance-clock"><span>{playing?'ON AIR':view.status==='complete'?'CUT COMPLETE':'SELECTED CUT'}</span><strong>{timecode(view.elapsedMs||0)} <em>/ 00:28</em></strong></div>
      <ol className="cue-tape">{selected.cues.map((cue,index)=><li key={index} className={playing&&view.cueIndex===index?'cue-active':''}><span>{timecode(index*7000)}</span><div><small>{index===3?'THE ENDING':`ACT ${['I','II','III'][index]}`} / {cue.action==='none'?'quiet':cue.action}</small><p>{cue.speech}</p></div></li>)}</ol>
      <div className="performance-actions"><button className="receive-button" type="button" onClick={()=>play()} disabled={disabled||!view.connected}>Rehearse ▶</button><button type="button" onClick={()=>play(true)} disabled={disabled||!view.connected||!view.recordSupported||view.recording}>Capture 28s ●</button><button type="button" onClick={stopPerformance} disabled={!playing}>Stop ■</button></div>
      <p className="capture-note">Captioned WebM saves locally and is silent. Use OBS or an editor for the voice track.</p>
      <div className="receiver-export"><button type="button" disabled={!view.connected} onClick={()=>afterimageBridge.setVoice(!view.voiceEnabled)} aria-pressed={view.voiceEnabled}>{view.voiceEnabled?'Voice on ♫':'Voice off ♫'}</button><button type="button" onClick={()=>{setDraftLines(selected.cues.map(cue=>cue.speech));setEditor(!editor);}} disabled={disabled} aria-expanded={editor}>Edit this cut</button><button type="button" onClick={()=>downloadText(toMarkdown(reception),`nox-afterimage-script.md`)}>Export script ↓</button><button type="button" onClick={()=>downloadText(JSON.stringify(reception,null,2),'nox-afterimage-reception.json')}>Export reception ↓</button>{generated&&<button type="button" disabled={disabled||!seed.trim()} onClick={event=>receive(event,true)}>New take ↗</button>}</div>
      {editor&&<div className="cut-editor"><p>Your edits stay in this browser. Changing branch starts a fresh cut.</p>{draftLines.map((line,index)=><label key={index}>{index===3?'Ending':`Act ${index+1}`}<textarea value={line} maxLength={90} onChange={e=>setDraftLines(lines=>lines.map((old,i)=>i===index?e.target.value:old))} rows={2}/></label>)}<button type="button" className="receive-button" onClick={saveEdits} disabled={disabled||draftLines.length!==4||draftLines.some(line=>!line.trim())}>Apply edits</button></div>}
      <div className="reception-caption"><span>POST CAPTION</span><p>{packet.caption}</p></div>
      {metrics&&<p className="reception-metrics">{metrics.provider} · {metrics.model} · received in {(metrics.totalMs/1000).toFixed(1)}s{metrics.cacheHit?' · warm cache':''}</p>}
    </motion.div></AnimatePresence>
    <details className="receiver-how"><summary>What is this machine actually doing?</summary><p>One model request writes three small stories and two endings each. You select one of six cuts. A local cue timer directs NOX’s existing face, lighting, gravity and other allowed scenes. Replays and edits use no text-model request; cloud voice still uses its speech quota.</p><p>The 28-second timeline is a rehearsal schedule. His mouth follows audio energy; caption cuts are timed, not word-perfect audio alignment.</p></details>
    <div className="receiver-archive"><div><span className="eyebrow">RECEPTION ARCHIVE</span><small>{items.length}/12 · {store.persistent?'this browser':'temporary'}</small></div>{items.length?items.map(item=><div className="archive-row" key={item.id}><button type="button" disabled={disabled} onClick={()=>restore(item.id)}><b>{item.packet.title}</b><span>{item.source==='authored'?'Authored example':'AI signal'} · {new Date(item.createdAt).toLocaleDateString()}</span></button><button type="button" disabled={disabled} onClick={()=>remove(item.id)} aria-label={`Delete reception ${item.packet.title}`}>×</button></div>):<p>The first reception you keep will appear here.</p>}<p className="archive-note">{store.persistent?'Local plaintext storage, without cloud sync. Export before changing device or domain.':'Browser storage is unavailable. This archive is temporary; export anything you want to keep.'}</p></div>
  </div>;
}
