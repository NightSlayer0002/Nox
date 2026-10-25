import React,{Suspense,lazy,useCallback,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {knowledge,knowledgeChanged,downloadText} from '/js/workbench.js';
import {readTheme,saveTheme,applyTheme} from '/js/preferences.js';
import {sourceBackground} from '/js/source-background.js';
import {visit} from '/js/visit-scope.js';
import {SourceBoundary} from './source-boundary.jsx';
import {mountCompanionHub} from './companion-hub.jsx';
applyTheme(readTheme());
const SourceScene=lazy(()=>import('./source-scene.jsx'));
const Afterimage=lazy(()=>import('./afterimage.jsx'));
function Background(){const connect=useCallback(canvas=>sourceBackground.publish(canvas),[]);return <SourceBoundary><Suspense fallback={<div className="source-fallback"/>}><SourceScene onCanvas={connect}/></Suspense></SourceBoundary>;}
const background=document.getElementById('workspace-background');if(background)createRoot(background).render(<Background/>);

const commands=[
  ['NOX','Talk something through','#conversation'],['Discover','Try an explanation, mystery or guessing game','#discover'],['Explore together','Bring an idea or try the Moon example','#learn'],['Guessing game','Ask questions and follow clues','#guessing'],['Scene studio','Gravity, expressions and filming','#scenes'],['Afterimage','Branch and perform a fictional transmission','#afterimage'],['Chats from this visit','Search this visit’s conversations','#library'],['Preferences','Inspect and change approved preferences','#memory'],['Your access','Current capabilities and allowances','#access'],
  ['New conversation','Start a new thread','new-chat'],['Settings','AI provider, voice and owner access','inside-button'],['Knowledge notebook','Add text for NOX to work with','knowledge'],['How NOX works','Capabilities and privacy','system'],
  ['Gravity','Toggle the gravity program','scene:gravity'],['Spotlight','Toggle a cursor spotlight','scene:spotlight'],['Orbit','Toggle a small universe','scene:orbit'],['Reset scene','Return to a quiet room','reset-button'],
];
function Dialog({title,children,onClose,kind}){
  const ref=useRef(null),reduce=useReducedMotion();
  useEffect(()=>{const dialog=ref.current,previous=document.activeElement;dialog.showModal();if(kind==='command-dialog')dialog.querySelector('.command-search')?.focus();const close=()=>onClose();dialog.addEventListener('close',close);return()=>{dialog.removeEventListener('close',close);dialog.close();previous?.focus?.();};},[]);
  return <dialog ref={ref} className={`lab-dialog ${kind||''}`} onClick={e=>{if(e.target===ref.current){const rect=ref.current.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)onClose();}}} aria-label={title}>
    <motion.div initial={reduce?false:{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:.2}}>
      <div className="dialog-top"><p className="eyebrow">NOX</p><button type="button" onClick={onClose} aria-label={`Close ${title}`}>×</button></div><h2>{title}</h2>{children}
    </motion.div>
  </dialog>;
}
function Notebook(){
  const [documents,setDocuments]=useState(()=>knowledge.list()),[enabled,setEnabled]=useState(()=>knowledge.enabled),[title,setTitle]=useState(''),[text,setText]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState(false),reduce=useReducedMotion();
  const [replacement,setReplacement]=useState(undefined),[pendingDelete,setPendingDelete]=useState(null),[busy,setBusy]=useState(false),recovery=knowledge.recovery;
  const mutationPending=useRef(false),draftRevision=useRef(0);
  const refresh=()=>{setDocuments(knowledge.list());setEnabled(knowledge.enabled);};
  useEffect(()=>{const listener=()=>refresh();window.addEventListener('storage',listener);return()=>window.removeEventListener('storage',listener);},[]);
  async function act(fn,message){if(mutationPending.current)return false;mutationPending.current=true;setBusy(true);try{await fn();refresh();knowledgeChanged();setStatus(typeof message==='function'?message():message);setError(false);return true;}catch(e){refresh();setStatus(e.message);setError(true);return false;}finally{mutationPending.current=false;setBusy(false);}}
  const addedMessage=()=>!knowledge.persistent?(enabled?'Added for this visit. Relevant passages can accompany your next question. Export notes before refreshing.':'Added for this visit. Turn on notebook context to use relevant passages in chat.'):enabled?'Note saved. Relevant passages can accompany your next question.':'Note saved. Turn on notebook context to include relevant passages in chat.';
  async function submit(e){
    e.preventDefault();const submitted={title,text},revision=draftRevision.current;
    if(await act(()=>knowledge.add(submitted),addedMessage)){
      // Saving may wait for another tab's lock. Only clear the submitted draft.
      if(draftRevision.current===revision){setTitle('');setText('');}
      else setStatus(`${addedMessage()} Your newer draft is still here and has not been saved.`);
    }
  }
  async function importFile(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(!/\.(txt|md|markdown)$/i.test(file.name))throw Error('Choose a .txt or Markdown file.');if(file.size>128*1024)throw Error('Choose a text file smaller than 128 KB. Each note allows 24,000 characters.');await act(async()=>knowledge.add({title:file.name,text:await file.text()}),addedMessage);}catch(error){setStatus(error.message);setError(true);}}
  async function removeNote(doc){const removed=await act(async()=>{if(!await knowledge.remove(doc.id))throw Error('This note was already removed in another tab.');},visit.owner?'Note deleted. Future questions will not include it.':'Note removed from this visit.');if(removed)setPendingDelete(null);}
  return <>
    <p className="lab-note">{visit.owner?'Give NOX useful context: a project brief, story outline, or your own notes. Relevant excerpts accompany a question when context is enabled.':'A scratchpad for this visit. Relevant excerpts can accompany your questions while context is enabled. Export a copy to keep these notes.'}</p>
    {!knowledge.crossTabSafe&&<p className="lab-note" role="status">This browser cannot safely save changes across tabs. Saved notes remain readable and exportable. Use a browser with Web Locks support to edit them.</p>}
    {recovery&&<section className="lab-form" aria-label="Notebook recovery"><p className="lab-note">{recovery.reason==='changed'?'The saved notebook changed in another tab.':recovery.reason==='unsupported'?'The saved notebook uses an unsupported format.':'The saved notebook could not be read.'} Its original data is untouched. New notes last for this visit until you explicitly replace it.</p><div className="lab-actions"><button type="button" onClick={()=>{const raw=knowledge.exportOriginal();if(raw!==null)downloadText(raw,'nox-original-notebook.json');}}>Download original notebook</button><button type="button" onClick={()=>setReplacement(knowledge.exportOriginal())}>Replace protected notebook</button></div>{replacement!==undefined&&<div role="group" aria-label="Confirm notebook replacement"><p className="lab-note">Save this visit’s {documents.length} notes together with any readable original notes? Unreadable original data will be replaced. Download the original first if you need it.</p><button type="button" disabled={busy} onClick={async()=>{await act(async()=>{if(!await knowledge.resetOriginal(replacement))throw Error('The original changed or could not be replaced. Download its current copy and review again.');},'This visit’s notebook is now saved.');setReplacement(undefined);}}>Confirm notebook replacement</button><button type="button" disabled={busy} onClick={()=>setReplacement(undefined)}>Keep original notebook</button></div>}</section>}
    <div className="lab-actions"><label className="lab-check"><input type="checkbox" checked={enabled} disabled={busy} onChange={e=>act(()=>knowledge.setEnabled(e.target.checked),e.target.checked?'Notebook context enabled.':'Notebook context disabled. Notes stay saved.')} />Use relevant notes in chat</label><button className="quiet-button" type="button" onClick={()=>downloadText(knowledge.export(),'nox-knowledge.json')}>Export notes </button></div>
    <form className="lab-form" onSubmit={submit}>
      <label htmlFor="knowledge-title">Note title (optional)</label><input id="knowledge-title" value={title} onChange={e=>{draftRevision.current++;setTitle(e.target.value);}} maxLength={160} placeholder="Uses the first line if left blank" />
      <label htmlFor="knowledge-text">Source text</label><textarea id="knowledge-text" value={text} onChange={e=>{draftRevision.current++;setText(e.target.value);}} maxLength={24000} placeholder={visit.owner?'Paste the details NOX should know…':'Paste text to keep handy during this visit…'} required />
      <div className="lab-actions"><button className="cream-button" type="submit" disabled={busy||!text.trim()}>{visit.owner&&knowledge.persistent?'Save note':'Add for this visit'}</button><span className="lab-note">{text.length.toLocaleString()} / 24,000 characters</span></div>
    </form>
    <div className="lab-form"><label htmlFor="knowledge-file">Or import a text / Markdown file</label><input type="file" id="knowledge-file" disabled={busy} accept=".txt,.md,.markdown,text/plain,text/markdown" onChange={importFile} /></div>
    <p className={`lab-note ${error?'error':''}`} role="status">{status}</p>
    <p className="lab-note">{documents.length} / 24 notes · {knowledge.persistent?'Saved as plaintext in this browser. Export before changing device or domain.':'Temporary notes clear on refresh. Export notes to keep them.'}</p>
    <div className="knowledge-list"><AnimatePresence initial={false}>{documents.map(doc=><motion.article key={doc.id} className="knowledge-row" layout={!reduce} initial={reduce?false:{opacity:0}} animate={{opacity:1}} exit={reduce?undefined:{opacity:0}} transition={{duration:.18}}><div><h3>{doc.title}</h3><p>{doc.text.slice(0,180)}{doc.text.length>180?'…':''}</p><small className="lab-note">{doc.text.length.toLocaleString()} characters</small></div>{pendingDelete===doc.id?<div className="inline-confirm" role="group" aria-label={`Confirm deletion of ${doc.title}`}><p className="lab-note">Delete this note {visit.owner?'from this browser':'from this visit'}? There is no cloud copy or undo.</p><button type="button" disabled={busy} onClick={()=>removeNote(doc)}>Delete note</button><button type="button" autoFocus disabled={busy} onClick={()=>setPendingDelete(null)}>Keep note</button></div>:<button type="button" disabled={busy} aria-label={`Delete note ${doc.title}`} onClick={()=>setPendingDelete(doc.id)}>Delete</button>}</motion.article>)}</AnimatePresence>{!documents.length&&<p className="empty-state">{visit.owner?'Your notebook is empty. Add a brief and ask NOX a specific question about it.':'Your scratchpad is empty. Add a passage, then ask NOX a question about it.'}</p>}</div>
  </>;
}
function System(){return <div className="how-nox-works">
  <p className="lab-note">A familiar character for conversation, curiosity, and play. Here is what NOX can do today.</p>
  <section><h3>Talk and understand</h3><p>Ask a question, bring a passage, or use the optional learning example. Free supports brief and balanced replies. Complete written answers stay in chat; spoken replies read a concise opening. AI answers can be wrong.</p></section>
  <section><h3>Your visit stays temporary</h3><p>Guest conversations, activities, and approved preferences clear when you refresh. Preferences lets you inspect, change, and forget what applies during this visit. Export a conversation or story if you want a file copy. The private developer archive is separate.</p></section>
  <section><h3>Play together</h3><p>The Moon example is an authored scientific model. The guessing game uses a fixed set of objects and supported questions. Afterimage is a branching fictional performance you can edit, export, and capture. Custom generation currently requires private developer access.</p></section>
  <section><h3>Voice and presence</h3><p>No narration starts on first arrival. Turn spoken replies on, use explicit dictation, or choose Read aloud. Stop clears playing and queued speech. Poking, dragging, and stage effects keep narration running. Captions and typed input remain available. Camera is a local preview; NOX receives no camera images.</p></section>
  <section><h3>Your data and your control</h3><p>Guest work clears on refresh. Export a conversation or story to keep a file copy. Approved preferences, relevant notes, and conversation context may be sent to the AI service. Forgetting prevents future inclusion; it cannot retract requests already sent.</p></section>
  <section><h3>Free access</h3><p>Free includes core conversation, visit preferences, and authored activities. Text and natural voice have separate allowances. Your access shows this deployment’s actual limits. Developer access is separate.</p></section>
  <section><h3>Honest boundaries</h3><p>NOX is a fictional AI character. The brain visualization follows app and audio activity; it does not display the model’s private thoughts. NOX cannot browse the web, control your device, work overnight, or perform arbitrary actions. This release has no dedicated younger-child family mode.</p></section>
</div>;}
function Workbench({initial,onClose}){const [tab,setTab]=useState(initial),reduce=useReducedMotion();return <Dialog title={tab==='knowledge'?'Notes for this visit':'How NOX works'} onClose={onClose}>
  <div className="lab-tabs" role="tablist" aria-label="NOX workbench" onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'knowledge':e.key==='End'?'system':tab==='knowledge'?'system':'knowledge';setTab(next);document.getElementById(`${next}-tab`)?.focus();}}}><button role="tab" tabIndex={tab==='knowledge'?0:-1} aria-selected={tab==='knowledge'} aria-controls="workbench-panel" id="knowledge-tab" onClick={()=>setTab('knowledge')}>Notes</button><button role="tab" tabIndex={tab==='system'?0:-1} aria-selected={tab==='system'} aria-controls="workbench-panel" id="system-tab" onClick={()=>setTab('system')}>How NOX works</button></div>
  <AnimatePresence mode="wait" initial={false}><motion.div key={tab} id="workbench-panel" role="tabpanel" aria-labelledby={`${tab}-tab`} initial={reduce?false:{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={reduce?undefined:{opacity:0,y:-4}} transition={{duration:.13}}>{tab==='knowledge'?<Notebook/>:<System/>}</motion.div></AnimatePresence>
</Dialog>;}
function Palette({onClose,run}){const [query,setQuery]=useState('');const matches=commands.filter(c=>`${c[0]} ${c[1]}`.toLowerCase().includes(query.toLowerCase()));return <Dialog title="Navigate NOX" kind="command-dialog" onClose={onClose}><label className="sr-only" htmlFor="command-search">Search commands</label><input className="command-search" id="command-search" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&matches[0])run(matches[0][2]);}} placeholder="Search pages, actions, settings…" autoFocus/><div className="command-list">{matches.map(([title,description,id])=><button key={id} onClick={()=>run(id)}><span>{title}</span><small>{description}</small></button>)}{!matches.length&&<p className="empty-state">No command matches that search.</p>}</div></Dialog>;}
function Toolbar(){const [open,setOpen]=useState(null),[dark,setDark]=useState(()=>readTheme()==='dark');
  useEffect(()=>{applyTheme(saveTheme(dark?'dark':'light'));},[dark]);
  useEffect(()=>{const sync=e=>{if(e.key==='nox.theme.v2')setDark(readTheme()==='dark');};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
  useEffect(()=>{const key=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setOpen(current=>current=== 'commands'?null:'commands');}};const notebook=()=>setOpen('knowledge');window.addEventListener('keydown',key);document.getElementById('knowledge-button')?.addEventListener('click',notebook);document.getElementById('knowledge-chat-button')?.addEventListener('click',notebook);return()=>{window.removeEventListener('keydown',key);document.getElementById('knowledge-button')?.removeEventListener('click',notebook);document.getElementById('knowledge-chat-button')?.removeEventListener('click',notebook);};},[]);
  function run(id){setOpen(null);if(['knowledge','system'].includes(id)){setOpen(id);return;}if(id.startsWith('#')){location.hash=id;setTimeout(()=>{if(id==='#conversation')document.getElementById('message')?.focus();},0);return;}setTimeout(()=>{if(id.startsWith('scene:')){location.hash='#scenes';document.querySelector(`[data-scene="${id.slice(6)}"]`)?.click();}else document.getElementById(id)?.click();},0);}
  const tools=document.getElementById('settings-workspace-tools');
  return <><div className="lab-toolbar"><button onClick={()=>setOpen('commands')} aria-label="Open command palette"><span>Navigate</span><kbd>Ctrl K</kbd></button></div>{tools&&createPortal(<><button type="button" onClick={()=>{document.getElementById('inside-dialog')?.close();setOpen('system');}}>About NOX</button><button type="button" onClick={()=>setDark(!dark)} aria-label={dark?'Switch to light room':'Switch to dark room'}>{dark?'Light room':'Dark room'}</button></>,tools)}{open==='commands'?<Palette onClose={()=>setOpen(null)} run={run}/>:open&&<Workbench key={open} initial={open} onClose={()=>setOpen(null)}/>}</>;
}
const mount=document.getElementById('workspace-controls');if(mount)createRoot(mount).render(<Toolbar/>);
function ReceiverRoute(){
  const [active,setActive]=useState(()=>location.hash==='#afterimage');
  useEffect(()=>{const change=()=>setActive(location.hash==='#afterimage');window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
  return active?<SourceBoundary fallback={<p className="receiver-error" role="alert">The receiver could not load. Reload to retry; ordinary chat and scenes remain available.</p>}><Suspense fallback={<p className="receiver-notice" role="status">Opening AFTERIMAGE…</p>}><Afterimage/></Suspense></SourceBoundary>:null;
}
const receiver=document.getElementById('afterimage-root');if(receiver)createRoot(receiver).render(<ReceiverRoute/>);
mountCompanionHub();
