// IME candidate confirmation is editing, not a request to send the draft.
export function attachComposerSubmission({input,form,onSend}){
  let composing=false;
  const start=()=>{composing=true;},end=()=>{composing=false;};
  const keydown=event=>{
    if(composing||event.isComposing||event.keyCode===229||event.which===229)return;
    if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();onSend(input.value);}
  };
  const submit=event=>{event.preventDefault();if(!composing)onSend(input.value);};
  input.addEventListener('compositionstart',start);input.addEventListener('compositionend',end);
  input.addEventListener('keydown',keydown);form.addEventListener('submit',submit);
  return ()=>{input.removeEventListener('compositionstart',start);input.removeEventListener('compositionend',end);input.removeEventListener('keydown',keydown);form.removeEventListener('submit',submit);};
}
