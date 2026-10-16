const $=id=>document.getElementById(id);
const views={explore:['Explore','','A place to begin.'],conversation:['Conversation','','Think something through with NOX.'],scenes:['Scene studio','','Shape a performance and capture it.'],library:['Library','','Return to a conversation.'],afterimage:['Afterimage','','A fictional transmission you can change.']};
export function createNavigation({history,onOpen,onNew,onStart}) {
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
  function applyView(){const view=location.hash.slice(1),current=Object.hasOwn(views,view)?view:'explore';document.body.dataset.view=current;$('view-label').textContent=views[current][0];const [first,,note]=views[current];$('workspace-heading').textContent=first;$('workspace-note').textContent=note;document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==current);document.querySelectorAll('a[data-view]').forEach(link=>{const active=link.dataset.view===current;link.classList.toggle('selected',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});if(currentView&&currentView!==current){setMenu(false);window.scrollTo({top:0,left:0,behavior:'auto'});$('workspace-main').focus({preventScroll:true});}currentView=current;}
  function setView(view){setMenu(false);if(location.hash!==`#${view}`)location.hash=view;applyView();}
  async function open(id){await onOpen(id);setView('conversation');}
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
    $('resume-chats').replaceChildren();all.filter(t=>t.turns.length).slice(0,3).forEach(t=>{const b=document.createElement('button');b.className='resume-row';const icon=document.createElement('span'),content=document.createElement('span'),title=document.createElement('b'),meta=document.createElement('small'),arrow=document.createElement('span');icon.textContent='NOX';title.textContent=t.title;meta.textContent=`${t.turns.length} messages · ${new Date(t.updated).toLocaleDateString(undefined,{month:'short',day:'numeric'})}`;arrow.textContent='';content.append(title,meta);b.append(icon,content,arrow);b.addEventListener('click',()=>open(t.id));$('resume-chats').append(b);});
    if(!$('resume-chats').children.length){const p=document.createElement('p');p.className='empty-state';p.textContent='A fresh start. Choose a thought below, or start a conversation of your own.';$('resume-chats').append(p);}
    $('history-list').replaceChildren();const matches=history.list($('history-search').value).filter(t=>t.turns.length);$('history-count').textContent=`${all.length} ${document.body.dataset.visit==='guest'?'temporary':'saved'} conversation${all.length===1?'':'s'}`;
    for(const t of matches){const row=document.createElement('div'),button=document.createElement('button'),title=document.createElement('b'),preview=document.createElement('span'),meta=document.createElement('small'),remove=document.createElement('button');row.className='history-item';button.className='history-open';title.textContent=t.title;preview.textContent=t.turns.at(-1)?.content||'A blank page.';meta.textContent=`${t.turns.length} messages · ${new Date(t.updated).toLocaleDateString()}`;button.append(title,preview,meta);button.addEventListener('click',()=>open(t.id));remove.className='delete-chat';remove.setAttribute('aria-label',`Delete ${t.title}`);remove.textContent='×';remove.addEventListener('click',async()=>{await history.remove(t.id);await onOpen(history.active().id);render();});row.append(button,remove);$('history-list').append(row);}
    if(!matches.length){const p=document.createElement('p');p.className='empty-state';p.textContent=$('history-search').value?'No conversations match that search.':'Your conversations will appear here. Start one with NOX.';$('history-list').append(p);}
    $('history-storage-note').hidden=document.body.dataset.visit==='guest';
    $('history-storage-note').textContent=document.body.dataset.visit==='guest'?'':!history.persistent?'Storage is unavailable. These conversations last for this visit; export a copy to keep them.':history.crossTabSafe?'Saved in this browser. Export a copy before changing devices or domains.':'Saved in this browser. Use one workspace tab here; this browser cannot coordinate writes across tabs.';
  }
  $('new-chat').addEventListener('click',async()=>{await onNew();setView('conversation');render();});
  document.querySelectorAll('[data-start]').forEach(b=>b.addEventListener('click',async()=>{await onNew();setView('conversation');await onStart(b.dataset.start,b.dataset.persona||'companion');}));
  $('history-search').addEventListener('input',render);
  $('export-history').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([history.export()],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`nox-conversations-${new Date().toISOString().slice(0,10)}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  window.addEventListener('hashchange',applyView);$('today-label').textContent=new Date().toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'}).toUpperCase();applyView();render();return {render,setView};
}
