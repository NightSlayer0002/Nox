import React,{Suspense,lazy,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {normalizeAfterimage} from '../shared/afterimage.js';
import {afterimageBridge} from '/js/afterimage-bridge.js';
import {createAfterimageStore} from '/js/afterimage-store.js';
import {buildSelectedPerformance,toMarkdown} from '/js/afterimage-engine.js';
import {downloadText} from '/js/workbench.js';
import {FIRST_CONTACT} from './afterimage-example.js';
import {visit} from '/js/visit-scope.js';
import {EXPORT_PROFILES,resolveExportProfile} from '/js/export-profile.js';
const Lattice=lazy(()=>import('./afterimage-lattice.jsx'));
const disk=visit.storage;
const store=createAfterimageStore(disk);
const example=normalizeAfterimage(FIRST_CONTACT);
const timecode=ms=>`${String(Math.floor(ms/1000/60)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
const tones=[['wonder','Wonder','A small impossible thing.'],['uncanny','Uncanny','Leave the light on.'],['bold','Bold','Break something interesting.']];
// The route unmounts this receiver. Keep unfinished input for this visit only.
let receiverDraft=null;

export default function Afterimage(){
  const [items,setItems]=useState(()=>store.list()),[current,setCurrent]=useState(()=>store.list()[0]||null),[seed,setSeed]=useState(()=>receiverDraft?.seed??store.list()[0]?.seed??''),[tone,setTone]=useState(()=>receiverDraft?.tone??store.list()[0]?.tone??'uncanny');
  const [view,setView]=useState(()=>afterimageBridge.snapshot()),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[editor,setEditor]=useState(false),[draftLines,setDraftLines]=useState([]);
  const request=useRef(null),version=useRef(0),variation=useRef(0);
  const reduceMotion=useReducedMotion();
  useEffect(()=>{receiverDraft={seed,tone};},[seed,tone]);
  useEffect(()=>afterimageBridge.subscribe(()=>setView(afterimageBridge.snapshot())),[]);
  useEffect(()=>store.subscribe(()=>setItems(store.list())),[]);
  useEffect(()=>{if(view.status==='complete')setNotice('Cut complete. Try another ending, or capture this one.');},[view.status]);
  useEffect(()=>()=>{version.current++;request.current?.abort();afterimageBridge.stop('receiver closed');},[]);
  const packet=current?.packet||example,signalIndex=current?.signalIndex||0,endingIndex=current?.endingIndex||0,signal=packet.signals[signalIndex];
  const selected=buildSelectedPerformance(packet,signalIndex,endingIndex,current?.editedLines),playing=view.status==='playing',disabled=busy||playing;
  const exportProfile=resolveExportProfile(view.exportProfile);
  const canGenerate=visit.owner&&view.connected&&view.connection?.kind==='live';
  const reception=current||{packet:example,seed:'A door in a window with no wall.',tone:'uncanny',source:'authored',signalIndex:0,endingIndex:0,createdAt:new Date().toISOString()};
  const cancel=()=>{version.current++;request.current?.abort();request.current=null;setBusy(false);setNotice('Generation cancelled. Your seed is still here.');};
  const choose=(which,index)=>{
    afterimageBridge.stop('selection changed');
    try{const base=current||store.add(reception);const next=store.update(base.id,{[which]:index});if(!next)throw new Error('This reception was removed. Choose another from your archive.');setCurrent(next);setEditor(false);setDraftLines([]);setError('');setNotice('A different cut. No new model request.');}catch(e){setError(e.message);}
  };
  async function receive(event,newTake=false){
    event?.preventDefault();if(!canGenerate||!seed.trim()||busy||playing)return;
    const ownVersion=++version.current,controller=new AbortController();request.current=controller;setBusy(true);setError('');setNotice('NOX is writing three story branches.');
    if(newTake)variation.current=(variation.current+1)%1025;
    try{
      const result=await afterimageBridge.receive({seed:seed.trim(),tone,variation:variation.current,signal:controller.signal});
      if(controller.signal.aborted||version.current!==ownVersion)return;
      const next=store.add({packet:result.packet,seed:seed.trim(),tone,source:'live',metrics:result.metrics});setCurrent(next);setEditor(false);setNotice('Story ready. Choose from six possible cuts.');
    }catch(e){if(version.current===ownVersion&&e.name!=='AbortError'){setError(e.message||'The story could not be generated. Your seed is still here.');setNotice('Your previous cut and seed are kept.');}}
    finally{if(version.current===ownVersion){request.current=null;setBusy(false);}}
  }
  function useExample(){
    cancel();afterimageBridge.stop('authored example');
    try{const next=store.add({packet:example,seed:'A door in a window with no wall.',tone:'uncanny',source:'authored'});setCurrent(next);setEditor(false);setDraftLines([]);play(false,next);}catch(e){setError(e.message);}
  }
  function play(capture=false,take=reception){
    setError('');try{const started=capture?afterimageBridge.recordAndPlay(take.packet,take.signalIndex,take.endingIndex,take.editedLines):afterimageBridge.play(take.packet,take.signalIndex,take.endingIndex,take.editedLines);if(!started)throw new Error('The stage is not ready to play. Try again when it is connected.');setNotice(capture?'Capturing NOX locally. Orpheus voice is included when enabled.':'NOX is performing your selected cut.');if(window.innerWidth<=1200)document.getElementById('stage')?.scrollIntoView({behavior:reduceMotion?'instant':'smooth',block:'center'});}catch(e){setError(e.message);}
  }
  function stopPerformance(){afterimageBridge.stop('stopped by you');setNotice('Performance stopped. Your story is kept.');}
  function saveEdits(){
    try{const base=current||store.add(reception);const next=store.update(base.id,{editedLines:draftLines});if(!next)throw new Error('This reception was removed. Choose another from your archive.');setCurrent(next);setEditor(false);setDraftLines([]);setError('');setNotice('Your cut is edited. No model request.');}catch(e){setError(e.message);}
  }
  function restore(id){
    const item=store.get(id);if(!item){setError('This reception was removed from this browser.');return;}
    afterimageBridge.stop('archive selected');setCurrent(item);setSeed(item.seed);setTone(item.tone);setEditor(false);setDraftLines([]);setError('');setNotice('Reception restored. No model request.');
  }
  function remove(id){if(current?.id===id){afterimageBridge.stop('reception deleted');setCurrent(null);setEditor(false);setDraftLines([]);}store.remove(id);setNotice('Reception removed from this browser.');}
  const generated=current?.source==='live',metrics=current?.metrics;
  return <div className="afterimage-receiver">
    {createPortal(<AnimatePresence>{playing&&<motion.div className="receiver-onair" initial={{opacity:0,y:reduceMotion?0:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduceMotion?0:12}} transition={{duration:reduceMotion?0:.18}}><span><i/>{view.recording?'Capturing':'Playing'} <b>{timecode(view.elapsedMs||0)} / 00:28</b></span><button type="button" onClick={stopPerformance}>Stop performance</button></motion.div>}</AnimatePresence>,document.body)}
    <div className="receiver-top"><span className="eyebrow">Afterimage</span><span className={`receiver-state ${playing?'is-playing':''}`}><i/>{busy?'Writing':playing?'Playing':view.connected?'Ready':'Connecting'}</span></div>
    <h2>A story you can change.</h2>
    <p className="receiver-intro">Choose a branch and an ending in a fictional micro-story, then let NOX perform your cut.</p>
    <div className="receiver-example"><button className="receive-button" type="button" onClick={useExample} disabled={disabled||!view.connected}>Play example</button><p>First contact is an authored sample. Play it, edit the lines or capture a 28-second clip.</p></div>
    <details className="receiver-create">
      <summary>Create a new story</summary>
      {!canGenerate?<div className="receiver-access"><p>{!visit.owner?'Custom generation requires owner access. You can play, edit and export the authored example as a guest.':view.connection?.kind==='locked'?'Owner sign-in is required before you can generate a story.':'Connect a configured model before you write a seed.'}</p><button type="button" onClick={()=>document.getElementById('settings-button')?.click()}>{!visit.owner||view.connection?.kind==='locked'?'Owner sign-in':'Connection settings'}</button></div>:<form className="receiver-form" onSubmit={receive} aria-busy={busy}>
      <p className="receiver-generation-note">Owner generation · uses your configured text model.</p>
      <label htmlFor="afterimage-seed">Start with a thought</label>
      <textarea id="afterimage-seed" value={seed} onChange={e=>{setSeed(e.target.value);variation.current=0;}} maxLength={600} rows={2} placeholder="An abandoned elevator keeps arriving at my floor…" disabled={disabled}/>
      <div className="receiver-input-note"><span>Only this seed and tone go to your configured model.</span><span>{seed.length}/600</span></div>
      <div className="receiver-tones" role="group" aria-label="Story tone">{tones.map(([id,label,hint])=><button key={id} type="button" aria-pressed={tone===id} disabled={disabled} title={hint} onClick={()=>setTone(id)}>{label}</button>)}</div>
      <div className="receiver-form-actions"><button className="receive-button" type="submit" disabled={!seed.trim()||disabled}>{busy?'Writing…':'Generate story'}</button>{busy&&<button type="button" onClick={cancel}>Cancel generation</button>}</div>
    </form>}
    </details>
    {error&&<p className="receiver-error" role="alert">{error}</p>}<p className="receiver-notice" role="status">{notice||'Choose a branch to explore a different cut.'}</p>
    <div className="reception-header"><span className="source-tag">{generated?'Model-generated story':'Authored sample'}</span><span>{current?new Date(current.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'No text-model request'}</span></div>
    <AnimatePresence mode="wait" initial={false}><motion.div key={current?.id||'first-contact'} initial={{opacity:0,y:reduceMotion?0:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduceMotion?0:-6}} transition={{duration:reduceMotion?0:.22}}>
      <h3 className="reception-title">{packet.title}</h3><p className="reception-anchor">{packet.anchor}</p>
      <Suspense fallback={<div className="lattice-loading">Opening story branches…</div>}><Lattice packet={packet} signalIndex={signalIndex} endingIndex={endingIndex} onSignal={index=>choose('signalIndex',index)} onEnding={index=>choose('endingIndex',index)} playing={playing&&!reduceMotion} disabled={disabled}/></Suspense>
      <p className="receiver-choice-label">Choose a branch</p><div className="signal-choices" role="group" aria-label="Choose a branch">{packet.signals.map((item,index)=><button key={index} aria-pressed={signalIndex===index} disabled={disabled} onClick={()=>choose('signalIndex',index)}>{item.label}</button>)}</div>
      <p className="signal-premise">{signal.premise}</p>
      <p className="receiver-choice-label">Choose an ending</p><div className="ending-choices" role="group" aria-label="Choose an ending">{signal.endings.map((ending,index)=><button key={index} aria-pressed={endingIndex===index} disabled={disabled} onClick={()=>choose('endingIndex',index)}>{ending.label}</button>)}</div>
      <div className="performance-clock"><span>{playing?'Playing':view.status==='complete'?'Cut complete':'Selected cut'}</span><strong>{timecode(view.elapsedMs||0)} <em>/ 00:28</em></strong></div>
      <ol className="cue-tape">{selected.cues.map((cue,index)=><li key={index} className={playing&&view.cueIndex===index?'cue-active':''}><span>{timecode(index*7000)}</span><div><small>{index===3?'Ending':`Beat ${index+1}`} · {cue.action==='none'?'quiet':cue.action}</small><p>{cue.speech}</p></div></li>)}</ol>
      <div className="capture-profile"><label htmlFor="afterimage-export-profile">Clip format</label><select id="afterimage-export-profile" value={exportProfile.id} disabled={view.recording} aria-describedby="afterimage-capture-note" onChange={event=>{try{afterimageBridge.setExportProfile(event.target.value);setError('');}catch(error){setError(error.message);}}}>{EXPORT_PROFILES.map(profile=><option key={profile.id} value={profile.id}>{profile.label} · {profile.width} × {profile.height}</option>)}</select></div>
      <div className="performance-actions"><button className="receive-button" type="button" onClick={()=>play()} disabled={disabled||!view.connected}>Play this cut</button><button type="button" onClick={()=>play(true)} disabled={disabled||!view.connected||!view.recordSupported||view.recording}>Capture 28 seconds</button>{playing&&<button type="button" onClick={stopPerformance}>Stop</button>}</div>
      <p className="capture-note" id="afterimage-capture-note">{exportProfile.width} × {exportProfile.height} · {exportProfile.frameRate} fps · Captioned WebM saves locally with enabled Orpheus audio. Browser voice cannot be captured.</p>
      <div className="receiver-export"><button type="button" disabled={!view.connected} onClick={()=>afterimageBridge.setVoice(!view.voiceEnabled)} aria-pressed={view.voiceEnabled}>{view.voiceEnabled?'Voice on':'Voice off'}</button><button type="button" onClick={()=>{setDraftLines(selected.cues.map(cue=>cue.speech));setEditor(!editor);}} disabled={disabled} aria-expanded={editor}>Edit this cut</button><button type="button" onClick={()=>downloadText(toMarkdown(reception),`nox-afterimage-script.md`)}>Export script</button><button type="button" onClick={()=>downloadText(JSON.stringify(reception,null,2),'nox-afterimage-reception.json')}>Export story data</button>{generated&&canGenerate&&<button type="button" disabled={disabled||!seed.trim()} onClick={event=>receive(event,true)}>New take</button>}</div>
      {editor&&<div className="cut-editor"><p>{store.persistent?'Your edits stay in this browser.':'Your edits last for this visit; export before refreshing.'} Changing branch starts a fresh cut.</p>{draftLines.map((line,index)=><label key={index}>{index===3?'Ending':`Beat ${index+1}`}<textarea value={line} maxLength={90} onChange={e=>setDraftLines(lines=>lines.map((old,i)=>i===index?e.target.value:old))} rows={2}/></label>)}<button type="button" className="receive-button" onClick={saveEdits} disabled={disabled||draftLines.length!==4||draftLines.some(line=>!line.trim())}>Apply edits</button></div>}
      <div className="reception-caption"><span>Caption</span><p>{packet.caption}</p></div>
      {metrics&&<p className="reception-metrics">{metrics.provider} · {metrics.model} · received in {(metrics.totalMs/1000).toFixed(1)}s{metrics.cacheHit?' · warm cache':''}{metrics.attempts===2?' · written in 2 attempts':''}</p>}
    </motion.div></AnimatePresence>
    <details className="receiver-how"><summary>How Afterimage works</summary><p>Each story has three branches and two endings per branch. Choose one of six cuts. NOX performs its four cues over 28 seconds using his existing expressions and scenes.</p><p>Replays and edits use no text-model request. New stories use your configured model. Cloud voice uses its speech quota. Captions follow the cue timer; they are not aligned word by word to audio.</p></details>
    <nav className="receiver-handoffs" aria-label="More ways to use NOX"><a href="#scenes">Open Scene studio</a><a href="#conversation">Talk with NOX</a></nav>
    <div className="receiver-archive"><div><span className="eyebrow">Saved stories</span><small>{items.length}/12 · {store.persistent?'this browser':'this visit'}</small></div>{items.length?items.map(item=><div className="archive-row" key={item.id}><button type="button" disabled={disabled} onClick={()=>restore(item.id)}><b>{item.packet.title}</b><span>{item.source==='authored'?'Authored sample':'Model-generated'} · {new Date(item.createdAt).toLocaleDateString()}</span></button><button type="button" disabled={disabled} onClick={()=>remove(item.id)} aria-label={`Delete reception ${item.packet.title}`}>Delete</button></div>):<p>Your first story will appear here.</p>}<p className="archive-note">{store.persistent?'Saved as plaintext in this browser, without cloud sync. Export before changing device or domain.':!visit.owner?'Stories and edits last for this guest visit. Export anything you want to keep before refreshing.':'Browser storage is unavailable. Export anything you want to keep.'}</p></div>
  </div>;
}
