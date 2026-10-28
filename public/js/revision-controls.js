// One active edit keeps one composer backup. Captured revision targets are never
// refreshed here: history validates the user's original intent when it commits.
export function createRevisionControls({getEdit,setEdit,getDraft,setDraft,getThread,onNotice=()=>{},onFocus=()=>{}}){
  let retry=null;const listeners=new Set();
  const following=target=>{const thread=getThread(),index=thread.id===target.threadId?thread.turns.findIndex(turn=>turn.id===target.turnId):-1;return index<0?null:thread.turns.length-index-1;};
  const snapshot=()=>{const edit=getEdit();return edit?{kind:'edit',following:edit.followingMessages??following(edit)??0}:retry?{kind:'retry',following:retry.following}:null;};
  const sync=()=>{const state=snapshot();for(const listener of listeners)listener(state);};
  const blocked=()=>{onNotice('Finish or cancel your current edit before revising or switching conversations.');onFocus();return false;};
  return {
    snapshot,sync,subscribe(listener){listeners.add(listener);listener(snapshot());return ()=>listeners.delete(listener);},
    edit(target,text){
      const current=getEdit();
      if(current){if(current.threadId===target.threadId&&current.turnId===target.turnId){onFocus();return true;}return blocked();}
      if(retry){onNotice('Keep the conversation or confirm Retry before opening an edit.');return false;}
      const count=following(target);if(count===null)return false;
      setEdit({...target,draftBeforeEdit:getDraft(),followingMessages:count});setDraft(text);sync();onFocus();return true;
    },
    finish(submitted){
      const edit=getEdit();if(!edit)return false;setEdit(null);
      const restore=getDraft()===submitted&&typeof edit.draftBeforeEdit==='string';
      if(restore)setDraft(edit.draftBeforeEdit);sync();return restore;
    },
    cancel(){
      const edit=getEdit();if(!edit&&!retry)return false;
      if(edit){setEdit(null);setDraft(edit.draftBeforeEdit??'');}
      retry=null;sync();onFocus();return true;
    },
    cancelRetry(){if(retry){retry=null;sync();}},
    canLeave(){if(getEdit())return blocked();retry=null;sync();return true;},
    async requestRetry(target,run){
      if(getEdit())return blocked();
      if(retry){onNotice('Keep the conversation or confirm the pending Retry first.');return false;}
      const count=following(target);if(count===null)return false;
      if(!count)return run(target);
      retry={target,following:count,run};sync();return true;
    },
    async confirm(){const pending=retry;if(!pending)return false;retry=null;sync();return pending.run(pending.target);},
  };
}

export function attachRevisionControls({controls,form,input,documentTarget=globalThis.document}){
  const doc=documentTarget,panel=doc.createElement('div'),title=doc.createElement('strong'),scope=doc.createElement('p'),actions=doc.createElement('div');
  panel.className='revision-notice';panel.hidden=true;panel.setAttribute('role','group');panel.setAttribute('aria-label','Message revision');
  scope.id='revision-scope';scope.setAttribute('role','status');scope.setAttribute('aria-live','polite');actions.className='revision-notice-actions';
  const cancel=doc.createElement('button'),confirm=doc.createElement('button');
  for(const button of [cancel,confirm]){button.type='button';button.className='quiet-button';}
  confirm.textContent='Replace and retry';actions.append(cancel,confirm);panel.append(title,scope,actions);form.before(panel);
  const describedBy=input.getAttribute('aria-describedby')||'';let previous;
  const release=controls.subscribe(state=>{
    panel.hidden=!state;confirm.hidden=state?.kind!=='retry';
    if(!state){if(describedBy)input.setAttribute('aria-describedby',describedBy);else input.removeAttribute('aria-describedby');previous=null;return;}
    const count=state.following,after=`the ${count} ${count===1?'message':'messages'} after it`;
    title.textContent=state.kind==='edit'?'Editing a message':'Retry an earlier reply?';
    scope.textContent=state.kind==='edit'?`Sending replaces this message${count?` and ${after}`:''}.`:`This replaces this reply and ${after}.`;
    cancel.textContent=state.kind==='edit'?'Cancel edit':'Keep conversation';input.setAttribute('aria-describedby',`${describedBy} revision-scope`.trim());
    if(state.kind==='retry'&&previous!=='retry')cancel.focus();previous=state.kind;
  });
  const cancelClick=()=>controls.cancel(),confirmClick=()=>controls.confirm();cancel.addEventListener('click',cancelClick);confirm.addEventListener('click',confirmClick);
  const escape=event=>{if(event.key==='Escape'&&!event.defaultPrevented&&!event.isComposing&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!doc.querySelector('dialog[open]')&&controls.cancel()){event.preventDefault();}};
  doc.addEventListener('keydown',escape);
  return ()=>{release();cancel.removeEventListener('click',cancelClick);confirm.removeEventListener('click',confirmClick);doc.removeEventListener('keydown',escape);panel.remove?.();};
}
