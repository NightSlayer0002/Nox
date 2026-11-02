// Dictation is an edit to a captured draft. Sending remains an explicit action.
export function createDictationDraft({input,getThread,canInsert=()=>true,onNotice}){
  let pending=null,revision=0,disposed=false;
  const changed=()=>{revision++;};input.addEventListener('input',changed);
  function cancel(ticket){if(ticket===undefined||pending?.ticket===ticket)pending=null;}
  return {
    get pending(){return pending!==null;},
    begin(){
      pending=null;if(disposed||!canInsert())return null;
      const thread=getThread();if(thread===null||thread===undefined)return null;
      const ticket=Object.freeze({});
      pending={ticket,thread,value:input.value,start:input.selectionStart,end:input.selectionEnd,revision};return ticket;
    },
    accept(text,ticket){
      if(disposed||!pending||pending.ticket!==ticket)return false;
      const own=pending;pending=null;
      if(typeof text!=='string'||!text.trim())return false;
      if(!canInsert()||getThread()!==own.thread||revision!==own.revision||input.value!==own.value||input.selectionStart!==own.start||input.selectionEnd!==own.end){
        onNotice?.('Your draft or conversation changed while listening. Your current text is kept; dictate again when you are ready.');return false;
      }
      const spoken=text.trim(),prefix=own.value.slice(0,own.start),suffix=own.value.slice(own.end);
      const before=prefix&&!/\s$/.test(prefix)&&!/^[,.;:!?…)\]}]/u.test(spoken)?' ':'';
      const after=suffix&&!/^[\s,.;:!?…)\]}]/u.test(suffix)?' ':'';
      const insertion=before+spoken+after,value=prefix+insertion+suffix;
      if(Number.isInteger(input.maxLength)&&input.maxLength>=0&&value.length>input.maxLength){
        onNotice?.('Dictation is too long for this draft. Your existing text is kept; try a shorter phrase.');return false;
      }
      input.value=value;input.focus();input.setSelectionRange(prefix.length+insertion.length,prefix.length+insertion.length);
      input.dispatchEvent(new Event('input',{bubbles:true}));onNotice?.('Dictation added. Review your message, then choose Send.');return true;
    },
    cancel,
    dispose(){disposed=true;pending=null;input.removeEventListener('input',changed);},
  };
}
