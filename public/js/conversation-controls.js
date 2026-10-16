// Public reply status stays separate from optional, session-local diagnostics.
export function createReplyDiagnostics({status,metrics,toggle}){
  let version=0,active=false;
  const current=token=>active&&token!==null&&token===version;
  const clearMetrics=()=>{
    metrics.textContent='';
    for(const key of ['model','depth','audioCache'])delete metrics.dataset[key];
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
    setStatus(text){status.textContent=text;},
    invalidate(){version++;active=false;},
    clear(){version++;active=false;status.textContent='';clearMetrics();},
  };
}

// Measure after removing the previous height so shorter text can shrink as well.
export function createComposerSizer(message,{windowTarget=globalThis.window,readStyle=element=>globalThis.getComputedStyle?.(element)||{}}={}){
  function resize(){
    const css=readStyle(message),minimum=parseFloat(css.minHeight)||42;
    const maximum=Math.max(minimum,parseFloat(css.maxHeight)||140);
    const borders=(parseFloat(css.borderTopWidth)||0)+(parseFloat(css.borderBottomWidth)||0);
    message.style.height='auto';
    const contentHeight=message.value?message.scrollHeight+borders:minimum;
    message.style.height=`${Math.max(minimum,Math.min(maximum,contentHeight))}px`;
    message.style.overflowY=contentHeight>maximum?'auto':'hidden';
  }
  message.addEventListener('input',resize);
  windowTarget?.addEventListener('resize',resize);
  windowTarget?.addEventListener('pageshow',resize);
  resize();
  return {resize,setValue(value){message.value=value;resize();}};
}
