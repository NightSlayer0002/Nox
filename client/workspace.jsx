import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {knowledge,knowledgeChanged,downloadText} from '/js/workbench.js';

const commands=[
  ['Explore','Open your workspace','#explore'],['Conversation','Talk with NOX','#conversation'],['Scene studio','Gravity, expressions and filming','#scenes'],['Library','Search saved conversations','#library'],
  ['New conversation','Start a new thread','new-chat'],['Preferences','Owner access, model and voice','inside-button'],['Knowledge notebook','Add text for NOX to work with','knowledge'],['How NOX works','Capabilities and privacy','system'],
  ['Gravity','Toggle the gravity program','scene:gravity'],['Spotlight','Toggle a cursor spotlight','scene:spotlight'],['Orbit','Toggle a small universe','scene:orbit'],['Reset scene','Return to a quiet room','reset-button'],
];
function Dialog({title,children,onClose,kind}){
  const ref=useRef(null),reduce=useReducedMotion();
  useEffect(()=>{const dialog=ref.current,previous=document.activeElement;dialog.showModal();const close=()=>onClose();dialog.addEventListener('close',close);return()=>{dialog.removeEventListener('close',close);dialog.close();previous?.focus?.();};},[]);
  return <dialog ref={ref} className={`lab-dialog ${kind||''}`} onClick={e=>{if(e.target===ref.current){const rect=ref.current.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)onClose();}}} aria-label={title}>
    <motion.div initial={reduce?false:{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:.2}}>
      <div className="dialog-top"><p className="eyebrow">NOX / LABORATORY</p><button type="button" onClick={onClose} aria-label={`Close ${title}`}>×</button></div><h2>{title}</h2>{children}
    </motion.div>
  </dialog>;
}
function Notebook(){
  const [documents,setDocuments]=useState(()=>knowledge.list()),[enabled,setEnabled]=useState(()=>knowledge.enabled),[title,setTitle]=useState(''),[text,setText]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState(false),reduce=useReducedMotion();
  const refresh=()=>{setDocuments(knowledge.list());setEnabled(knowledge.enabled);};
  useEffect(()=>{const listener=()=>refresh();window.addEventListener('storage',listener);return()=>window.removeEventListener('storage',listener);},[]);
  function act(fn,message){try{fn();refresh();knowledgeChanged();setStatus(message);setError(false);return true;}catch(e){setStatus(e.message);setError(true);return false;}}
  function submit(e){e.preventDefault();if(act(()=>knowledge.add({title,text}),'Note added. Relevant passages can accompany your next question.')){setTitle('');setText('');}}
  async function importFile(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(!/\.(txt|md|markdown)$/i.test(file.name))throw Error('Choose a .txt or Markdown file.');if(file.size>128*1024)throw Error('Choose a text file smaller than 128 KB. Each note allows 24,000 characters.');const content=await file.text();act(()=>knowledge.add({title:file.name,text:content}),'File added to this browser’s notebook.');}catch(error){setStatus(error.message);setError(true);}}
  return <>
    <p className="lab-note">Give NOX useful context: a project brief, story outline, or your own notes. Search runs here in your browser. Relevant excerpts are sent with a question when context is enabled.</p>
    <div className="lab-actions"><label className="lab-check"><input type="checkbox" checked={enabled} onChange={e=>act(()=>knowledge.setEnabled(e.target.checked),e.target.checked?'Notebook context enabled.':'Notebook context disabled. Notes stay saved.')} />Use relevant notes in chat</label><button className="quiet-button" type="button" onClick={()=>downloadText(knowledge.export(),'nox-knowledge.json')}>Export notes ↓</button></div>
    <form className="lab-form" onSubmit={submit}>
      <label htmlFor="knowledge-title">Note title</label><input id="knowledge-title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={160} placeholder="A name you’ll recognize" required />
      <label htmlFor="knowledge-text">Source text</label><textarea id="knowledge-text" value={text} onChange={e=>setText(e.target.value)} maxLength={24000} placeholder="Paste the details NOX should know…" required />
      <div className="lab-actions"><button className="cream-button" type="submit" disabled={!title.trim()||!text.trim()}>Save note ↗</button><span className="lab-note">{text.length.toLocaleString()} / 24,000 characters</span></div>
    </form>
    <div className="lab-form"><label htmlFor="knowledge-file">Or import a text / Markdown file</label><input type="file" id="knowledge-file" accept=".txt,.md,.markdown,text/plain,text/markdown" onChange={importFile} /></div>
    <p className={`lab-note ${error?'error':''}`} role="status">{status}</p>
    <p className="lab-note">{documents.length} / 24 notes · {knowledge.persistent?'Saved locally':'Temporary storage — export before leaving'}. Browser storage is plaintext. Use one tab when editing notes simultaneously; export before changing device or domain.</p>
    <div className="knowledge-list"><AnimatePresence initial={false}>{documents.map(doc=><motion.article key={doc.id} className="knowledge-row" layout={!reduce} initial={reduce?false:{opacity:0}} animate={{opacity:1}} exit={reduce?undefined:{opacity:0}} transition={{duration:.18}}><div><h3>{doc.title}</h3><p>{doc.text.slice(0,180)}{doc.text.length>180?'…':''}</p><small className="lab-note">{doc.text.length.toLocaleString()} characters</small></div><button type="button" aria-label={`Delete note ${doc.title}`} onClick={()=>act(()=>knowledge.remove(doc.id),'Note deleted. Future questions will not include it.')}>Delete</button></motion.article>)}</AnimatePresence>{!documents.length&&<p className="empty-state">Your notebook is empty. Add a brief and ask NOX a specific question about it.</p>}</div>
  </>;
}
function System(){return <>
  <p className="lab-note">An expressive character, a bounded AI system, and a creation studio. Here is what each part actually does.</p>
  <div className="lab-codepath">Your question → relevant notes + recent chat → protected server → selected model → validated reply → NOX’s face + optional voice</div>
  <div className="capability-grid">
    <article><h3>01 / Thought</h3><p>Quick keeps conversation short. Balanced gives a fuller answer. Deep uses a larger Groq model and more reasoning when Groq is selected. Longer thinking takes more time and free quota. Model answers can be wrong.</p></article>
    <article><h3>02 / Context</h3><p>Recent messages, an older-chat summary, explicit remembered facts, and relevant notebook passages accompany a turn. Local retrieval ranks words; it does not understand every synonym. Ask precise questions.</p></article>
    <article><h3>03 / Expression</h3><p>Pointer tracking, gestures, gravity and twenty expressions run locally. The model can request six allowlisted scene actions. Audio energy closes his mouth during pauses. His reactions don’t require an AI key.</p></article>
    <article><h3>04 / Voice & camera</h3><p>Browser speech or configured Groq Orpheus reads a concise opening. Full answers remain in chat. Camera preview stays local; NOX has no camera vision. Recorded WebM clips include captions and are silent.</p></article>
    <article><h3>05 / Access</h3><p>Provider keys stay on the server. Owner unlock creates a protected session for up to 12 hours. Lock ends access in this browser. This is a private owner prototype; it does not provide separate accounts for public users.</p></article>
    <article><h3>06 / Your data</h3><p>History and notes live in plaintext browser storage. Export before switching devices or domains. Enabled context travels to your selected AI service. Chat deletion here cannot retract data already sent to a provider.</p></article>
    <article><h3>07 / Speed</h3><p>Small context budgets, delayed summaries and reusable speech reduce work. Strict Groq output arrives as a validated packet; NVIDIA/Gemini can stream text. The visible timing is measured, rather than a speed guarantee.</p></article>
    <article><h3>08 / Boundaries</h3><p>NOX is a fictional AI character. He cannot browse, run arbitrary commands, or act outside his stage. Free services have limits. A model prompt is not a security boundary; server validation and authentication are.</p></article>
  </div>
</>;}
function Workbench({initial,onClose}){const [tab,setTab]=useState(initial),reduce=useReducedMotion();return <Dialog title={tab==='knowledge'?'A little context. A lot more depth.':'Inside the little machine.'} onClose={onClose}>
  <div className="lab-tabs" role="tablist" aria-label="NOX workbench" onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'knowledge':e.key==='End'?'system':tab==='knowledge'?'system':'knowledge';setTab(next);document.getElementById(`${next}-tab`)?.focus();}}}><button role="tab" tabIndex={tab==='knowledge'?0:-1} aria-selected={tab==='knowledge'} aria-controls="workbench-panel" id="knowledge-tab" onClick={()=>setTab('knowledge')}>Knowledge notebook</button><button role="tab" tabIndex={tab==='system'?0:-1} aria-selected={tab==='system'} aria-controls="workbench-panel" id="system-tab" onClick={()=>setTab('system')}>How NOX works</button></div>
  <AnimatePresence mode="wait" initial={false}><motion.div key={tab} id="workbench-panel" role="tabpanel" aria-labelledby={`${tab}-tab`} initial={reduce?false:{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={reduce?undefined:{opacity:0,y:-4}} transition={{duration:.13}}>{tab==='knowledge'?<Notebook/>:<System/>}</motion.div></AnimatePresence>
</Dialog>;}
function Palette({onClose,run}){const [query,setQuery]=useState('');const matches=commands.filter(c=>`${c[0]} ${c[1]}`.toLowerCase().includes(query.toLowerCase()));return <Dialog title="Where shall we go?" kind="command-dialog" onClose={onClose}><label className="sr-only" htmlFor="command-search">Search commands</label><input className="command-search" id="command-search" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&matches[0])run(matches[0][2]);}} placeholder="Search pages, actions, settings…" autoFocus/><div className="command-list">{matches.map(([title,description,id])=><button key={id} onClick={()=>run(id)}><span>{title}</span><small>{description}</small></button>)}{!matches.length&&<p className="empty-state">No command matches that search.</p>}</div></Dialog>;}
function Toolbar(){const [open,setOpen]=useState(null),[dark,setDark]=useState(()=>{try{return localStorage.getItem('nox.theme.v1')==='dark';}catch{return false;}});
  useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';try{localStorage.setItem('nox.theme.v1',dark?'dark':'light');}catch{}},[dark]);
  useEffect(()=>{const key=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setOpen(current=>current=== 'commands'?null:'commands');}};const notebook=()=>setOpen('knowledge');window.addEventListener('keydown',key);document.getElementById('knowledge-button')?.addEventListener('click',notebook);document.getElementById('knowledge-chat-button')?.addEventListener('click',notebook);return()=>{window.removeEventListener('keydown',key);document.getElementById('knowledge-button')?.removeEventListener('click',notebook);document.getElementById('knowledge-chat-button')?.removeEventListener('click',notebook);};},[]);
  function run(id){setOpen(null);if(['knowledge','system'].includes(id)){setOpen(id);return;}if(id.startsWith('#')){location.hash=id;setTimeout(()=>{if(id==='#conversation')document.getElementById('message')?.focus();},0);return;}setTimeout(()=>{if(id.startsWith('scene:')){location.hash='#scenes';document.querySelector(`[data-scene="${id.slice(6)}"]`)?.click();}else document.getElementById(id)?.click();},0);}
  return <><div className="lab-toolbar"><button onClick={()=>setOpen('commands')} aria-label="Open command palette">⌘ <span>Navigate</span> <kbd>Ctrl K</kbd></button><button onClick={()=>setOpen('system')}>Inside NOX</button><button onClick={()=>setDark(!dark)} aria-label={dark?'Switch to light room':'Switch to dark room'}>{dark?'☀':'◐'} <span className="theme-label">{dark?'Light':'Dark'}</span></button></div>{open==='commands'?<Palette onClose={()=>setOpen(null)} run={run}/>:open&&<Workbench key={open} initial={open} onClose={()=>setOpen(null)}/>}</>;
}
const mount=document.getElementById('workspace-controls');if(mount)createRoot(mount).render(<Toolbar/>);
