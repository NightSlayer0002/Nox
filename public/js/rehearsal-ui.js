import {createRehearsalSession,REHEARSAL_EXAMPLE} from './rehearsal-session.js';
import {loadRepository,loadRepositoryFile,readCodeFile,validateCodeSource} from './rehearsal-source.js';
import {parseNarration,createLineNarration} from './rehearsal-narration.js';
import {tokenizeSource} from './code-tokens.js';

// The source stays a companion to the existing chat, not a second conversation.
export function attachCodeRehearsal({getThread,send,voice,navigate=()=>{},canAct=()=>true,onContextChange=()=>{},documentTarget=globalThis.document}){
  const doc=documentTarget,$=id=>doc.getElementById(id),events=new AbortController(),sessions=new Map(),sent=new Map();
  let thread='',session,active=false,repository=null,loading=null,importVersion=0,renderedFile='',spokenPlan=null;
  let importNotice=false;
  const listen=(node,event,fn)=>node.addEventListener(event,fn,{signal:events.signal});
  const notice=(text,attention=false,fromImport=false)=>{const node=$('rehearsal-notice');node.textContent=text;node.dataset.attention=String(attention);importNotice=fromImport;};
  const narration=createLineNarration({voice:voice||{stop(){},speak:(_,options)=>options.onPlaybackUnavailable({message:'Voice is unavailable.'})},
    onLine:line=>{for(const row of $('rehearsal-code').children){const speaking=Number(row.dataset.line)===line;row.classList.toggle('speaking',speaking);if(speaking)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current');}},
    onState:(state,line,message)=>{$('rehearsal-stop').hidden=!['preparing','speaking'].includes(state);if(state==='preparing')notice(`Preparing line ${line}…`);if(state==='speaking')notice(`Speaking about line ${line}.`);if(state==='ended')notice('Walkthrough finished. The highlighted range and written explanations are kept.');if(state==='error')notice(message||'Voice could not finish. Written explanations are kept. You can replay when voice is available.',true);},
  });
  function contextChanged(){narration.stop();spokenPlan=null;$('rehearsal-replay').hidden=true;onContextChange();}
  function sync(){
    const id=getThread();if(id===thread)return;
    narration.stop();spokenPlan=null;cancelImport();repository=null;renderedFile='';thread=id;
    if(!sessions.has(id))sessions.set(id,{session:createRehearsalSession(),paste:'',name:'project.js',repo:'',correctionDraft:''});
    session=sessions.get(id).session;
    $('rehearsal-paste').value=sessions.get(id).paste;$('rehearsal-filename').value=sessions.get(id).name;$('rehearsal-url').value=sessions.get(id).repo;
    $('rehearsal-repo-files').replaceChildren();$('rehearsal-repo-files').hidden=true;notice('');render();
  }
  function cancelImport(){loading?.abort();loading=null;importVersion++;$('rehearsal-import').setAttribute('aria-busy','false');}
  function setOpen(value){
    sync();
    if(active===value)return;
    cancelImport();active=value;contextChanged();render();
  }
  function render(){
    if(!session)return;
    const state=session.snapshot(),file=state.file,section=state.section;
    doc.body.dataset.rehearsal=active?'open':'closed';
    $('rehearsal-panel').hidden=!active;
    $('rehearsal-panel').dataset.source=file?'ready':'empty';
    $('rehearsal-work').hidden=!file;
    $('rehearsal-replay').hidden=!spokenPlan;
    $('rehearsal-goal').value=state.goal;$('rehearsal-corrections').value=sessions.get(thread).correctionDraft;
    validateCorrections();
    $('rehearsal-loaded').replaceChildren(...state.files.map(f=>{const tab=doc.createElement('button');tab.type='button';tab.role='tab';tab.id=`study-file-${f.id}`;tab.dataset.sourceId=f.id;tab.textContent=f.path;tab.title=f.path;tab.setAttribute('aria-selected',String(f.id===file?.id));tab.tabIndex=f.id===file?.id?0:-1;tab.setAttribute('aria-controls','rehearsal-code');return tab;}));
    if(file){
      $('rehearsal-range').textContent=`Lines ${section.startLine}–${section.endLine} of ${section.totalLines}`;
      $('rehearsal-progress').textContent=`${state.discussed}/${section.totalLines} lines discussed · ${state.ready} self-checked`;
      const link=$('rehearsal-original');link.hidden=!file.url;link.href=file.url||'#';link.textContent=file.source==='github'?`View source · ${file.revision.slice(0,7)}`:'Source';
      if(renderedFile!==file.id){
        const coloured=tokenizeSource(file.text,file.path);
        $('rehearsal-code').replaceChildren(...file.lines.map((text,index)=>{
          const row=doc.createElement('div'),number=doc.createElement('button'),code=doc.createElement('code');
          row.className='code-line';row.dataset.line=String(index+1);number.type='button';number.className='code-line-number';number.textContent=String(index+1);number.setAttribute('aria-label',`Discuss from line ${index+1}`);
          for(const token of coloured[index]){
            if(token.kind==='plain')code.append(doc.createTextNode(token.text));
            else{const span=doc.createElement('span');span.className=`code-token token-${token.kind}`;span.textContent=token.text;code.append(span);}
          }
          row.append(number,code);return row;
        }));renderedFile=file.id;
      }
      for(const row of $('rehearsal-code').children){const selected=Number(row.dataset.line)>=section.startLine&&Number(row.dataset.line)<=section.endLine;row.classList.toggle('selected',selected);row.firstChild.setAttribute('aria-pressed',String(selected));}
      $('rehearsal-previous').disabled=section.startLine===1;$('rehearsal-next').disabled=section.endLine===section.totalLines;
      $('rehearsal-ready').checked=state.sectionReady;
      $('rehearsal-start').value=section.startLine;$('rehearsal-end').value=section.endLine;
      $('rehearsal-code').setAttribute('aria-label',`${file.path}, lines ${section.startLine} to ${section.endLine} selected`);
      $('rehearsal-code').setAttribute('aria-labelledby',`study-file-${file.id} rehearsal-range`);
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
  function selectionChanged(){cancelImport();contextChanged();render();revealSource();}
  function openSource(value){cancelImport();session.open(value);renderedFile='';$('rehearsal-import').open=false;contextChanged();render();notice('Code stays in this visit. Selected lines, goal and corrections go to AI with each message while this panel is open. Earlier chat replies may also quote code.');}
  async function importSource(action){
    sync();loading?.abort();const controller=new AbortController(),version=++importVersion,owner=thread;loading=controller;
    $('rehearsal-import').setAttribute('aria-busy','true');notice('Opening source…',false,true);
    try{const value=await action(controller.signal);if(controller.signal.aborted||version!==importVersion||owner!==getThread())return;value?.();}
    catch(error){if(version===importVersion&&owner===getThread()&&error.name!=='AbortError')notice(error.message||'Could not open the code. Paste it instead.',true,true);}
    finally{if(version===importVersion){loading=null;$('rehearsal-import').setAttribute('aria-busy','false');}}
  }
  async function ask(intent){
    sync();if(!canAct()){notice('Finish or cancel your current reply or edit first. Your code is kept.',true);return;}
    let ticket;try{ticket=capture(intent);}catch(error){notice(error.message,true);return;}
    if(!ticket)return;
    const c=ticket.ticket.context;if(intent==='narrate'&&c.endLine-c.startLine>=4){notice('Choose up to four lines for spoken walkthrough, or open the four-line example. Longer sections remain available for written discussion.',true);return;}
    const message=intent==='narrate'?`Explain ${c.path}, lines ${c.startLine}–${c.endLine}, for a spoken walkthrough. Give one short explanation per line in the [Lnumber] format.`:intent==='question'?`Ask me one interview question about ${c.path}, lines ${c.startLine}–${c.endLine}. Wait for my answer before giving feedback.`:`Walk me through ${c.path}, lines ${c.startLine}–${c.endLine}, without skipping the code. Explain the functions used and distinguish what you can see from what you would need another file to know.`;
    notice('The selected lines stay in view. NOX will not advance until you choose Next section.');
    await send(message,ticket);
  }
  function validateCorrections(){
    const input=$('rehearsal-corrections'),lines=input.value.split('\n').map(v=>v.trim()).filter(Boolean);
    const message=lines.length>6||lines.some(v=>v.length>240)?'Keep up to six corrections, each within 240 characters. Your draft is kept.':'';
    input.setCustomValidity(message);input.setAttribute('aria-invalid',String(Boolean(message)));return message;
  }
  function capture(intent='discuss'){sync();if(!active||!session.snapshot().file)return null;const error=validateCorrections();if(error)throw Error(error);return {thread,session,ticket:session.capture(intent)};}
  function bind(work,turn,text){if(work){work.input=text;sent.set(turn.id,work);}}
  function replay(turn){
    sync();if(!turn?.requiresSource)return null;
    const original=sent.get(turn.id);if(!original||original.thread!==thread)throw Error('This message needs its original code, which is no longer in this visit. Its answer is kept. Open the source and ask a new question.');
    const error=validateCorrections();if(error)throw Error(error);
    narration.stop();spokenPlan=null;const ticket=original.session.recall(original.ticket);active=true;session=original.session;renderedFile='';cancelImport();render();
    if(location.hash!=='#prepare-code')navigate('prepare-code');
    return {thread,session,ticket};
  }
  function context(work){return work?.ticket.context||null;}
  function completed(work,packet){
    if(work?.ticket?.context?.intent!=='narrate'||!packet||work.thread!==getThread()||work.session!==session||!active||!session.isCurrent(work.ticket))return false;
    spokenPlan=null;$('rehearsal-replay').hidden=true;
    try{narration.stop();spokenPlan={work,segments:parseNarration(packet.speech,work.ticket.context)};$('rehearsal-replay').hidden=false;revealSource();narration.start(spokenPlan.segments);return true;}
    catch(error){notice(error.message,true);return false;}
  }
  function committed(work,answer){if(!work||work.thread!==getThread()||work.session!==session||!active)return false;const saved=session.complete(work.ticket,answer,work.input);if(saved){render();revealSource();}return saved;}
  function protect(fn,fromImport=false){return event=>{try{fn(event);}catch(error){notice(error.message,true,fromImport);}};}
  listen($('rehearsal-close'),'click',()=>{
    setOpen(false);
    navigate('conversation');
    const entry=[$('prepare-code-nav'),doc.querySelector('.welcome-invitations a[href="#prepare-code"]')]
      .find(link=>link?.getClientRects().length);
    (entry||$('message')).focus({preventScroll:true});
  });
  listen($('rehearsal-example'),'click',protect(()=>openSource(REHEARSAL_EXAMPLE)));
  listen($('rehearsal-spoken-example'),'click',protect(()=>openSource({path:'total.js',source:'example',revision:'spoken-v1',text:'function total(items) {\n  const prices = items.map(item => item.price);\n  return prices.reduce((sum, price) => sum + price, 0);\n}'})));
  listen($('rehearsal-use-paste'),'click',protect(()=>{cancelImport();openSource(validateCodeSource({path:$('rehearsal-filename').value||'project.js',text:$('rehearsal-paste').value,source:'pasted',revision:'pasted'}));},true));
  listen($('rehearsal-local'),'change',event=>{const file=event.target.files?.[0];if(file)void importSource(async()=>{const value=await readCodeFile(file);return()=>openSource(value);});event.target.value='';});
  listen($('rehearsal-github'),'click',()=>void importSource(async signal=>{
    const result=await loadRepository($('rehearsal-url').value,{signal});return()=>{
      repository=result;const placeholder=doc.createElement('option');placeholder.value='';placeholder.textContent='Choose a source file';
      $('rehearsal-repo-files').replaceChildren(placeholder,...result.files.map((file,index)=>{const option=doc.createElement('option');option.value=String(index);option.textContent=file.path;return option;}));
      $('rehearsal-repo-files').hidden=false;notice(`${result.files.length} readable files at ${result.revision.slice(0,7)}.${result.truncated?' This repository list is partial; paste a missing file.':''} Choose one to open; NOX has not read the repository.`);
    };
  }));
  listen($('rehearsal-repo-files'),'change',event=>{if(!repository||event.target.value==='')return;const repo=repository,file=repo.files[Number(event.target.value)];if(file)void importSource(async signal=>{const value=await loadRepositoryFile(repo,file,{signal});return()=>openSource(value);});});
  function chooseFile(id,focus=false){
    if(importNotice){$('rehearsal-import').open=false;notice('');}
    session.switchFile(id);renderedFile='';selectionChanged();
    if(focus)$('rehearsal-loaded').querySelector('[aria-selected=true]')?.focus();
  }
  listen($('rehearsal-loaded'),'click',event=>{const tab=event.target.closest('[data-source-id]');if(tab&&tab.getAttribute('aria-selected')!=='true')chooseFile(tab.dataset.sourceId);});
  listen($('rehearsal-loaded'),'keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const tabs=[...$('rehearsal-loaded').children],index=tabs.indexOf(event.target);if(index<0)return;event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length;
    chooseFile(tabs[next].dataset.sourceId,true);
  });
  const importTabs=[...doc.querySelectorAll('[data-import-tab]')];
  function chooseImport(tab){cancelImport();for(const item of importTabs){const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;$(item.getAttribute('aria-controls')).hidden=!selected;}}
  for(const tab of importTabs){listen(tab,'click',()=>chooseImport(tab));listen(tab,'keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
    const index=importTabs.indexOf(tab),next=event.key==='Home'?0:event.key==='End'?importTabs.length-1:(index+(event.key==='ArrowLeft'?-1:1)+importTabs.length)%importTabs.length;
    chooseImport(importTabs[next]);importTabs[next].focus();
  });}
  listen($('rehearsal-code'),'click',event=>{const row=event.target.closest('.code-line-number')?.parentElement;if(row){session.select(Number(row.dataset.line));selectionChanged();}});
  listen($('rehearsal-select-range'),'click',protect(()=>{session.selectRange(Number($('rehearsal-start').value),Number($('rehearsal-end').value));selectionChanged();}));
  listen($('rehearsal-next'),'click',()=>{session.next();selectionChanged();});listen($('rehearsal-previous'),'click',()=>{session.previous();selectionChanged();});
  listen($('rehearsal-explain'),'click',()=>void ask('explain'));listen($('rehearsal-question'),'click',()=>void ask('question'));
  listen($('rehearsal-narrate'),'click',()=>void ask('narrate'));listen($('rehearsal-stop'),'click',()=>{narration.stop();notice('Walkthrough stopped. Your code and written explanations are kept.');});
  listen($('rehearsal-replay'),'click',()=>{if(canAct()&&spokenPlan?.work.thread===getThread()&&active&&session.isCurrent(spokenPlan.work.ticket)){revealSource();narration.start(spokenPlan.segments);}});
  listen($('rehearsal-ready'),'change',event=>{session.markReady(event.target.checked);render();});
  listen($('rehearsal-goal'),'input',protect(event=>{session.setGoal(event.target.value);contextChanged();}));
  listen($('rehearsal-corrections'),'input',event=>{sessions.get(thread).correctionDraft=event.target.value;const error=validateCorrections();if(error)notice(error,true);else{session.setCorrections(event.target.value);if($('rehearsal-notice').dataset.attention==='true')notice('');}contextChanged();});
  for(const [id,key] of [['rehearsal-paste','paste'],['rehearsal-filename','name'],['rehearsal-url','repo']])listen($(id),'input',event=>{cancelImport();sessions.get(thread)[key]=event.target.value;});
  listen($('rehearsal-export'),'click',()=>{
    const draft=validateCorrections()?`\nUnapplied correction draft (not sent):\n${sessions.get(thread).correctionDraft}\n`:'',text=session.export()+draft,url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),link=doc.createElement('a');link.href=url;link.download='nox-code-preparation.txt';doc.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Preparation sheet exported. This visit still clears on refresh.');
  });
  sync();
  const entry=new URL(location.href);
  if(entry.searchParams.get('prepare')==='code'&&(!entry.hash||entry.hash==='#conversation')&&doc===globalThis.document){
    entry.searchParams.delete('prepare');
    entry.hash='prepare-code';
    globalThis.history.replaceState(null,'',entry);
    navigate('prepare-code');
  }
  setOpen(location.hash==='#prepare-code');
  listen(doc,'visibilitychange',()=>{if(doc.hidden)narration.stop();});
  return {sync,setOpen,capture,context,bind,replay,completed,committed,stopNarration:()=>narration.stop(),dispose(){narration.stop();loading?.abort();events.abort();sessions.clear();sent.clear();}};
}
