import {createRehearsalSession,REHEARSAL_EXAMPLE} from './rehearsal-session.js';
import {loadRepository,loadRepositoryFile,readCodeFile,validateCodeSource} from './rehearsal-source.js';

// The source stays a companion to the existing chat, not a second conversation.
export function attachCodeRehearsal({getThread,send,canAct=()=>true,onContextChange=()=>{},documentTarget=globalThis.document}){
  const doc=documentTarget,$=id=>doc.getElementById(id),events=new AbortController(),sessions=new Map(),sent=new Map();
  let thread='',session,active=false,repository=null,loading=null,importVersion=0,renderedFile='';
  const listen=(node,event,fn)=>node.addEventListener(event,fn,{signal:events.signal});
  const notice=text=>{$('rehearsal-notice').textContent=text;};
  function sync(){
    const id=getThread();if(id===thread)return;
    cancelImport();repository=null;renderedFile='';thread=id;
    if(!sessions.has(id))sessions.set(id,{session:createRehearsalSession(),active:false,paste:'',name:'project.js',repo:'',correctionDraft:''});
    session=sessions.get(id).session;active=sessions.get(id).active;
    $('rehearsal-paste').value=sessions.get(id).paste;$('rehearsal-filename').value=sessions.get(id).name;$('rehearsal-url').value=sessions.get(id).repo;
    $('rehearsal-repo-files').replaceChildren();$('rehearsal-repo-files').hidden=true;notice('');render();
  }
  function cancelImport(){loading?.abort();loading=null;importVersion++;$('rehearsal-import').setAttribute('aria-busy','false');}
  function enabled(value){sync();cancelImport();active=value;sessions.get(thread).active=value;onContextChange();render();}
  function render(){
    if(!session)return;
    const state=session.snapshot(),file=state.file,section=state.section;
    doc.body.dataset.rehearsal=active?'open':'closed';
    $('rehearsal-panel').hidden=!active;$('rehearsal-toggle').setAttribute('aria-expanded',String(active));
    $('rehearsal-toggle').textContent=active?'Close code preparation':file?'Continue code preparation':'Prepare with code';
    $('rehearsal-work').hidden=!file;
    $('rehearsal-goal').value=state.goal;$('rehearsal-corrections').value=sessions.get(thread).correctionDraft;
    validateCorrections();
    $('rehearsal-loaded').replaceChildren(...state.files.map(f=>{const option=doc.createElement('option');option.value=f.id;option.textContent=f.path;return option;}));
    if(file){
      $('rehearsal-loaded').value=file.id;
      $('rehearsal-range').textContent=`Lines ${section.startLine}–${section.endLine} of ${section.totalLines}`;
      $('rehearsal-progress').textContent=`${state.discussed}/${section.totalLines} lines discussed · ${state.ready} self-checked`;
      const link=$('rehearsal-original');link.hidden=!file.url;link.href=file.url||'#';link.textContent=file.source==='github'?`View source · ${file.revision.slice(0,7)}`:'Source';
      if(renderedFile!==file.id){
        $('rehearsal-code').replaceChildren(...file.lines.map((text,index)=>{
          const row=doc.createElement('div'),number=doc.createElement('button'),code=doc.createElement('code');
          row.className='code-line';row.dataset.line=String(index+1);number.type='button';number.className='code-line-number';number.textContent=String(index+1);number.setAttribute('aria-label',`Discuss from line ${index+1}`);
          code.textContent=text||' ';row.append(number,code);return row;
        }));renderedFile=file.id;
      }
      for(const row of $('rehearsal-code').children){const selected=Number(row.dataset.line)>=section.startLine&&Number(row.dataset.line)<=section.endLine;row.classList.toggle('selected',selected);row.firstChild.setAttribute('aria-pressed',String(selected));}
      $('rehearsal-previous').disabled=section.startLine===1;$('rehearsal-next').disabled=section.endLine===section.totalLines;
      $('rehearsal-ready').checked=state.sectionReady;
      $('rehearsal-start').value=section.startLine;$('rehearsal-end').value=section.endLine;
      $('rehearsal-code').setAttribute('aria-label',`${file.path}, lines ${section.startLine} to ${section.endLine} selected`);
    }
    renderCall();
  }
  function renderCall(){
    const host=$('rehearsal-call-source');if(!host)return;host.replaceChildren();host.hidden=!active||!session?.snapshot().file;
    if(host.hidden)return;
    const {file,section}=session.snapshot(),title=doc.createElement('h3'),code=doc.createElement('pre'),note=doc.createElement('p');
    title.textContent=`${file.path} · lines ${section.startLine}–${section.endLine}`;
    code.textContent=section.code.split('\n').map((line,i)=>`${section.startLine+i}  ${line}`).join('\n');
    note.textContent='Selected source, not speech-synchronized highlighting. Long answers use a spoken opening; the full answer stays in chat.';
    host.append(title,code,note);
  }
  function revealSource(){const panel=$('rehearsal-panel'),code=$('rehearsal-code'),row=code.querySelector('.selected');if(row)code.scrollTop=Math.max(0,row.offsetTop-24);panel.scrollTop+=code.getBoundingClientRect().top-panel.getBoundingClientRect().top-32;}
  function selectionChanged(){cancelImport();onContextChange();render();revealSource();}
  function openSource(value){cancelImport();session.open(value);renderedFile='';$('rehearsal-import').open=false;enabled(true);notice('Code stays in this visit. Selected lines, goal and corrections go to AI with each message while this panel is open. Earlier chat replies may also quote code.');}
  async function importSource(action){
    sync();loading?.abort();const controller=new AbortController(),version=++importVersion,owner=thread;loading=controller;
    $('rehearsal-import').setAttribute('aria-busy','true');notice('Opening source…');
    try{const value=await action(controller.signal);if(controller.signal.aborted||version!==importVersion||owner!==getThread())return;value?.();}
    catch(error){if(version===importVersion&&owner===getThread()&&error.name!=='AbortError')notice(error.message||'Could not open the code. Paste it instead.');}
    finally{if(version===importVersion){loading=null;$('rehearsal-import').setAttribute('aria-busy','false');}}
  }
  async function ask(intent){
    sync();if(!canAct()){notice('Finish or cancel your current reply or edit first. Your code is kept.');return;}
    let ticket;try{ticket=capture(intent);}catch(error){notice(error.message);return;}
    if(!ticket)return;
    const c=ticket.ticket.context,message=intent==='question'?`Ask me one interview question about ${c.path}, lines ${c.startLine}–${c.endLine}. Wait for my answer before giving feedback.`:`Walk me through ${c.path}, lines ${c.startLine}–${c.endLine}, without skipping the code. Explain the functions used and distinguish what you can see from what you would need another file to know.`;
    notice('The selected lines stay in view. NOX will not advance until you choose Next section.');
    await send(message,ticket);
  }
  function validateCorrections(){
    const input=$('rehearsal-corrections'),lines=input.value.split('\n').map(v=>v.trim()).filter(Boolean);
    const message=lines.length>6||lines.some(v=>v.length>240)?'Keep up to six corrections, each within 240 characters. Your draft is kept.':'';
    input.setCustomValidity(message);return message;
  }
  function capture(intent='discuss'){sync();if(!active||!session.snapshot().file)return null;const error=validateCorrections();if(error)throw Error(error);return {thread,session,ticket:session.capture(intent)};}
  function bind(work,turn,text){if(work){work.input=text;sent.set(turn.id,work);}}
  function replay(turn){
    sync();if(!turn?.requiresSource)return null;
    const original=sent.get(turn.id);if(!original||original.thread!==thread)throw Error('This message needs its original code, which is no longer in this visit. Its answer is kept. Open the source and ask a new question.');
    const error=validateCorrections();if(error)throw Error(error);
    const ticket=original.session.recall(original.ticket);active=true;sessions.get(thread).active=true;session=original.session;renderedFile='';cancelImport();render();
    return {thread,session,ticket};
  }
  function context(work){return work?.ticket.context||null;}
  function committed(work,answer){if(!work||work.thread!==getThread()||work.session!==session||!active)return false;const saved=session.complete(work.ticket,answer,work.input);if(saved){render();revealSource();}return saved;}
  function protect(fn){return event=>{try{fn(event);}catch(error){notice(error.message);}};}
  listen($('rehearsal-toggle'),'click',()=>enabled(!active));listen($('rehearsal-close'),'click',()=>{enabled(false);$('rehearsal-toggle').focus();});
  listen($('rehearsal-example'),'click',protect(()=>openSource(REHEARSAL_EXAMPLE)));
  listen($('rehearsal-use-paste'),'click',protect(()=>{loading?.abort();importVersion++;openSource(validateCodeSource({path:$('rehearsal-filename').value||'project.js',text:$('rehearsal-paste').value,source:'pasted',revision:'pasted'}));}));
  listen($('rehearsal-local'),'change',event=>{const file=event.target.files?.[0];if(file)void importSource(async()=>{const value=await readCodeFile(file);return()=>openSource(value);});event.target.value='';});
  listen($('rehearsal-github'),'click',()=>void importSource(async signal=>{
    const result=await loadRepository($('rehearsal-url').value,{signal});return()=>{
      repository=result;const placeholder=doc.createElement('option');placeholder.value='';placeholder.textContent='Choose a source file';
      $('rehearsal-repo-files').replaceChildren(placeholder,...result.files.map((file,index)=>{const option=doc.createElement('option');option.value=String(index);option.textContent=file.path;return option;}));
      $('rehearsal-repo-files').hidden=false;notice(`${result.files.length} readable files at ${result.revision.slice(0,7)}.${result.truncated?' This repository list is partial; paste a missing file.':''} Choose one to open; NOX has not read the repository.`);
    };
  }));
  listen($('rehearsal-repo-files'),'change',event=>{if(!repository||event.target.value==='')return;const repo=repository,file=repo.files[Number(event.target.value)];if(file)void importSource(async signal=>{const value=await loadRepositoryFile(repo,file,{signal});return()=>openSource(value);});});
  listen($('rehearsal-loaded'),'change',event=>{session.switchFile(event.target.value);renderedFile='';selectionChanged();});
  listen($('rehearsal-code'),'click',event=>{const row=event.target.closest('.code-line-number')?.parentElement;if(row){session.select(Number(row.dataset.line));selectionChanged();}});
  listen($('rehearsal-select-range'),'click',protect(()=>{session.selectRange(Number($('rehearsal-start').value),Number($('rehearsal-end').value));selectionChanged();}));
  listen($('rehearsal-next'),'click',()=>{session.next();selectionChanged();});listen($('rehearsal-previous'),'click',()=>{session.previous();selectionChanged();});
  listen($('rehearsal-explain'),'click',()=>void ask('explain'));listen($('rehearsal-question'),'click',()=>void ask('question'));
  listen($('rehearsal-ready'),'change',event=>{session.markReady(event.target.checked);render();});
  listen($('rehearsal-goal'),'input',protect(event=>{session.setGoal(event.target.value);onContextChange();}));
  listen($('rehearsal-corrections'),'input',event=>{sessions.get(thread).correctionDraft=event.target.value;const error=validateCorrections();if(error)notice(error);else session.setCorrections(event.target.value);onContextChange();});
  for(const [id,key] of [['rehearsal-paste','paste'],['rehearsal-filename','name'],['rehearsal-url','repo']])listen($(id),'input',event=>{cancelImport();sessions.get(thread)[key]=event.target.value;});
  listen($('rehearsal-export'),'click',()=>{
    const draft=validateCorrections()?`\nUnapplied correction draft (not sent):\n${sessions.get(thread).correctionDraft}\n`:'',text=session.export()+draft,url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),link=doc.createElement('a');link.href=url;link.download='nox-code-preparation.txt';doc.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Preparation sheet exported. This visit still clears on refresh.');
  });
  listen(doc,'nox:prepare-code',()=>{if(location.hash!=='#conversation')location.hash='conversation';enabled(true);$('rehearsal-example').focus();});
  sync();if(new URLSearchParams(location.search).get('prepare')==='code')enabled(true);
  return {sync,capture,context,bind,replay,committed,dispose(){loading?.abort();events.abort();sessions.clear();sent.clear();}};
}
