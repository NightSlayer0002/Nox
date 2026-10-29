import {historyNotice,historyFailure} from './history-notice.js';
const $=id=>document.getElementById(id);
const views={explore:['Explore','','A place to begin.'],conversation:['Conversation','','Think something through with NOX.'],scenes:['Scene studio','','Shape a performance and capture it.'],library:['Chats','','Return to a conversation.'],afterimage:['Afterimage','','A fictional transmission you can change.']};
Object.assign(views,{discover:['Discover','','Follow your curiosity.'],memory:['Preferences','','Only what you approve.'],access:['Your access','','Current capabilities and limits.'],learn:['Explore together','','Bring an idea or try an example.'],guessing:['Play together','','Ask questions. Follow the clues.']});
export function createNavigation({history,onOpen,onNew,onStart,onRemove}) {
  let currentView;
  function setMenu(open,restoreFocus=false){document.body.dataset.menuOpen=String(open);$('menu-button').setAttribute('aria-expanded',String(open));$('workspace-shell').inert=open;if(restoreFocus)$('menu-button').focus();}
  setMenu(false);
  $('menu-button').addEventListener('click',()=>{const open=document.body.dataset.menuOpen!=='true';setMenu(open);if(open)$('close-navigation').focus();});
  $('close-navigation').addEventListener('click',()=>setMenu(false,true));
  document.querySelectorAll('a[data-view]').forEach(link=>link.addEventListener('click',()=>setMenu(false)));
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.dataset.menuOpen==='true'){event.preventDefault();setMenu(false,true);}},{capture:true});
  window.matchMedia?.('(max-width:700px)').addEventListener('change',event=>{if(!event.matches)setMenu(false);});
  document.body.dataset.presence='visible';
  $('presence-toggle').addEventListener('click',()=>{const visible=document.body.dataset.presence==='hidden';document.body.dataset.presence=visible?'visible':'hidden';$('presence-toggle').setAttribute('aria-expanded',String(visible));$('presence-toggle').textContent=visible?'Hide NOX':'Show NOX';});
  function applyView(){
    const view=location.hash.slice(1),current=Object.hasOwn(views,view)?view:'conversation';
    document.body.dataset.view=current;$('view-label').textContent=views[current][0];
    const [first,,note]=views[current];$('workspace-heading').textContent=first;$('workspace-note').textContent=note;
    // Reparent the existing controls, never the canvas or narration state.
    $(current==='conversation'?'presence-menu-panel':'stage-wrap').append($('stage-playback'));
    $(current==='conversation'?'stage-playback':'stage-heading').append($('stage-time'));
    const replay=$('replay-voice');replay.hidden=replay.disabled=current!=='conversation';
    $('presence-menu').open=false;
    const panel=current==='guessing'?'learn':current==='explore'?'discover':current;
    document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==panel);
    document.querySelectorAll('a[data-view]').forEach(link=>{const active=link.dataset.view===current||current==='explore'&&link.dataset.view==='discover';link.classList.toggle('selected',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    if(currentView&&currentView!==current){setMenu(false);window.scrollTo({top:0,left:0,behavior:'auto'});$('workspace-main').focus({preventScroll:true});}
    currentView=current;
  }
  function setView(view){setMenu(false);if(location.hash!==`#${view}`)location.hash=view;applyView();}
  async function open(id){if(await onOpen(id)===false)return false;setView('conversation');return true;}
  async function start(){if(await onNew()===false)return;setView('conversation');render();$('message').focus();}
  function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function render(){
    document.body.dataset.conversationStarted=String(history.active().turns.some(turn=>turn.role==='user'));
    const all=history.list().filter(t=>t.turns.length),active=history.active().id;
    $('recent-chats').replaceChildren();
    all.slice(0,6).forEach(t=>{
      const b=document.createElement('button');b.textContent=t.title;b.setAttribute('title',t.title);
      b.classList.toggle('active',t.id===active);if(t.id===active)b.setAttribute('aria-current','true');
      b.addEventListener('click',()=>open(t.id));$('recent-chats').append(b);
    });
    if(!$('recent-chats').children.length){const p=document.createElement('p');p.className='empty';p.textContent='Your first conversation starts here.';$('recent-chats').append(p);}
    $('history-list').replaceChildren();const matches=history.list($('history-search').value).filter(t=>t.turns.length);$('history-count').textContent=`${all.length} ${document.body.dataset.visit==='guest'?'temporary':'saved'} conversation${all.length===1?'':'s'}`;
    for(const t of matches){
      const row=document.createElement('div'),button=document.createElement('button'),title=document.createElement('b'),preview=document.createElement('span'),meta=document.createElement('small'),remove=document.createElement('button');
      row.className='history-item';button.className='history-open';title.textContent=t.title;preview.textContent=t.turns.at(-1)?.content||'A blank page.';meta.textContent=`${t.turns.length} messages · ${new Date(t.updated).toLocaleDateString()}`;button.append(title,preview,meta);button.addEventListener('click',()=>open(t.id));
      remove.className='delete-chat';remove.setAttribute('aria-label',`Delete ${t.title}`);remove.textContent='×';
      remove.addEventListener('click',()=>{
        if(remove.hidden)return;
        const confirmation=document.createElement('div'),note=document.createElement('p'),confirm=document.createElement('button'),keep=document.createElement('button');
        confirmation.className='history-delete-confirm';note.textContent='Delete this conversation? Export a copy first if you want to keep it.';confirm.textContent='Delete conversation';keep.textContent='Keep';remove.hidden=true;
        keep.addEventListener('click',()=>{remove.hidden=false;row.replaceChildren(button,remove);remove.focus();});
        confirm.addEventListener('click',async()=>{
          if(confirm.disabled)return;confirm.disabled=keep.disabled=true;
          try{
            let removed=false,failure;try{removed=await (onRemove?onRemove(t.id):history.remove(t.id));}catch(error){failure=error.message;}
            if(!removed){note.textContent=failure||historyFailure(history,'The conversation was not removed. Reopen Chats and try again.');note.setAttribute('role','alert');return;}
            if(!onRemove)await onOpen(history.active().id);render();
          }finally{confirm.disabled=keep.disabled=false;}
        });
        confirmation.append(note,confirm,keep);row.append(confirmation);keep.focus();
      });
      row.append(button,remove);$('history-list').append(row);
    }
    if(!matches.length){
      const empty=document.createElement('div'),p=document.createElement('p');empty.className='history-empty';p.textContent=$('history-search').value?'No conversations match that search.':'A fresh thought. A little company.';empty.append(p);
      if(!$('history-search').value){const button=document.createElement('button');button.type='button';button.className='history-start';button.textContent='Start conversation';button.addEventListener('click',start);empty.append(button);}
      $('history-list').append(empty);
    }
    const guest=document.body.dataset.visit==='guest',notice=historyNotice(history,{guest});
    $('history-storage-note').hidden=false;
    $('history-storage-note').textContent=notice.privacy+' '+(guest?'Export a copy if you want to keep these conversations.':history.persistent?'Export before clearing browser data or changing devices.':'Export a copy before refreshing.');
    if(!guest&&history.crossTabSafe===false)$('history-storage-note').textContent+=' Use one workspace tab; this browser cannot coordinate archive writes.';
    $('conversation-privacy').textContent=notice.privacy;
    $('archive-notice').hidden=!notice.message;$('archive-notice-text').textContent=notice.message;
    $('archive-download').hidden=$('archive-reset').hidden=!notice.protected;
  }
  $('new-chat').addEventListener('click',start);
  document.querySelectorAll('[data-start]').forEach(b=>b.addEventListener('click',async()=>{if(await onNew()===false)return;setView('conversation');await onStart(b.dataset.start,b.dataset.persona||'companion');}));
  $('history-search').addEventListener('input',render);
  $('export-history').addEventListener('click',()=>download(history.export(),`nox-conversations-${new Date().toISOString().slice(0,10)}.json`));
  $('archive-download').addEventListener('click',()=>{const raw=history.exportOriginal();if(raw!==null)download(raw,'nox-original-archive.json');});
  $('archive-reset').addEventListener('click',()=>$('archive-reset-dialog').showModal());
  $('archive-reset-cancel').addEventListener('click',()=>$('archive-reset-dialog').close());
  $('archive-reset-confirm').addEventListener('click',async()=>{
    $('archive-reset-confirm').disabled=true;
    try{const reset=await history.resetArchive();$('archive-reset-dialog').close();render();if(!reset){$('archive-notice').hidden=false;$('archive-notice-text').textContent='The original archive changed or could not be replaced. It was not reset. Review its current recovery copy before trying again.';}}
    finally{$('archive-reset-confirm').disabled=false;}
  });
  window.addEventListener('hashchange',applyView);applyView();render();return {render,setView};
}
