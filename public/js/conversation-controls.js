// Public reply status stays separate from optional, session-local diagnostics.
export function createReplyDiagnostics({status,metrics,toggle}){
  let version=0,active=false;
  const current=token=>active&&token!==null&&token===version;
  const clearMetrics=()=>{
    metrics.textContent='';
    for(const key of ['model','depth','audioCache','voiceStartMs','voicePreparationMs'])delete metrics.dataset[key];
  };
  const visibility=()=>{metrics.hidden=!toggle.checked;};
  toggle.checked=false;visibility();
  toggle.addEventListener('change',visibility);
  return {
    begin(text=''){
      version++;active=true;clearMetrics();status.textContent=text;return version;
    },
    complete(token,timing,depth='quick'){
      if(!current(token))return;
      status.textContent='';
      if(!timing)return;
      metrics.textContent=`${timing.firstTextMs==null?'Reply':`First words ${timing.firstTextMs} ms · reply`} ${timing.totalMs} ms · ${timing.provider}`;
      metrics.dataset.model=timing.model||'';metrics.dataset.depth=timing.depth||depth;
    },
    capture(){return active?version:null;},
    voice(token,elapsed,cache='unknown'){
      if(!current(token))return;
      metrics.textContent+=`${metrics.textContent?' · ':''}voice ${Math.round(elapsed)} ms`;
      metrics.dataset.audioCache=cache;
    },
    playback(token,timing){
      if(!current(token)||timing?.status!=='speaking')return;
      metrics.textContent+=`${metrics.textContent?' · ':''}speech starts ${timing.totalMs} ms after voice request`;
      metrics.dataset.voiceStartMs=String(timing.totalMs);
      metrics.dataset.voicePreparationMs=String(timing.preparationMs??'');
    },
    setStatus(text){status.textContent=text;},
    invalidate(){version++;active=false;},
    clear(){version++;active=false;status.textContent='';clearMetrics();},
  };
}

// Measure after removing the previous height so shorter text can shrink as well.
export function createComposerSizer(message,{form=message.form,windowTarget=globalThis.window,viewport=globalThis.visualViewport,readStyle=element=>globalThis.getComputedStyle?.(element)||{}}={}){
  function resize(){
    const css=readStyle(message),minimum=parseFloat(css.minHeight)||32;
    const maximum=Math.max(minimum,parseFloat(css.maxHeight)||120);
    const borders=(parseFloat(css.borderTopWidth)||0)+(parseFloat(css.borderBottomWidth)||0);
    message.style.height='auto';
    const contentHeight=message.value?message.scrollHeight+borders:minimum;
    const height=Math.max(minimum,Math.min(maximum,contentHeight));
    message.style.height=`${height}px`;
    message.style.overflowY=contentHeight>maximum?'auto':'hidden';
    if(form)form.dataset.expanded=String(height>minimum);
  }
  message.addEventListener('input',resize);
  windowTarget?.addEventListener('resize',resize);
  windowTarget?.addEventListener('pageshow',resize);
  viewport?.addEventListener('resize',resize,{passive:true});
  resize();
  return {resize,setValue(value){message.value=value;resize();}};
}

// Leave summary activation to the browser; only dismiss the compact options menu.
export function attachComposerOptions(details,{documentTarget=globalThis.document,windowTarget=globalThis.window,form=details.closest('form')}={}){
  const summary=details.querySelector('summary');
  const close=()=>{details.open=false;};
  documentTarget?.addEventListener('pointerdown',event=>{
    if(details.open&&!details.contains(event.target))close();
  });
  windowTarget?.addEventListener('keydown',event=>{
    if(!details.open||event.key!=='Escape')return;
    event.preventDefault();event.stopPropagation();close();summary?.focus();
  },{capture:true});
  // Native select arrows can fire change before a keyboard user commits a choice.
  details.querySelector('#knowledge-chat-button')?.addEventListener('click',()=>{close();summary?.focus();});
  form?.addEventListener('submit',close);
  return {close};
}

// Both menus share native activation, outside-click dismissal and Escape focus.
export const attachDetailsMenu=attachComposerOptions;
