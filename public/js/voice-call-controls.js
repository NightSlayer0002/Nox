import {createVoiceCall} from './voice-call.js';

const labels={ready:'A little closer.',unsupported:'Voice input is not available in this browser.',connecting:'Waiting for your microphone…',listening:'Listening to you',thinking:'NOX is thinking',preparing:'Finding his voice…',speaking:'NOX is speaking',paused:'Take your time.',muted:'Microphone muted',error:'Let’s try that again.'};

// The same stage moves into this focused view. No second character, transcript,
// recorder, account or paid audio connection is created for the call UI.
export function attachVoiceCall({documentTarget=globalThis.document,options,getDraft=()=>'',restoreDraft=()=>{}}){
  const doc=documentTarget,$=id=>doc.getElementById(id),dialog=$('voice-call-dialog'),bezel=$('stage-bezel');
  let marker,savedDraft='',disposed=false;
  const session=createVoiceCall(options);
  function render(state){
    if(disposed)return;
    if(state.open&&!dialog.open){
      savedDraft=getDraft();marker=doc.createComment('NOX stage home');bezel.parentNode.insertBefore(marker,bezel);
      $('voice-call-presence').append(bezel);doc.body.dataset.callOpen='true';dialog.showModal();
    }else if(!state.open&&marker){
      if(dialog.open)dialog.close();marker.replaceWith(bezel);marker=null;doc.body.dataset.callOpen='false';restoreDraft(savedDraft);$('call-button').focus();
    }
    dialog.dataset.status=state.status;
    $('voice-call-status').textContent=state.error||labels[state.status]||'NOX is here.';
    $('voice-call-heard').textContent=state.heard?`You: ${state.heard}`:'';
    $('voice-call-connect').hidden=state.active&&!['paused','error'].includes(state.status);
    $('voice-call-connect').disabled=state.status==='unsupported';
    $('voice-call-connect').textContent=state.active?'Resume listening':'Connect microphone';
    $('voice-call-mute').hidden=!state.active;$('voice-call-mute').setAttribute('aria-pressed',String(state.muted));
    $('voice-call-mute').textContent=state.muted?'Unmute':'Mute microphone';
    $('voice-call-interrupt').hidden=!state.active||!['thinking','preparing','speaking'].includes(state.status);
    $('voice-call-type').hidden=state.status!=='unsupported'&&state.status!=='error';
  }
  const release=session.subscribe(render),events=new AbortController(),listen=(node,type,fn)=>node.addEventListener(type,fn,{signal:events.signal});
  listen($('call-button'),'click',()=>session.open());
  listen($('voice-call-connect'),'click',()=>session.connect());
  listen($('voice-call-mute'),'click',()=>session.toggleMute());
  listen($('voice-call-interrupt'),'click',()=>session.interrupt());
  listen($('voice-call-end'),'click',()=>session.end());
  listen($('voice-call-close'),'click',()=>session.end());
  listen($('voice-call-type'),'click',()=>{session.end();$('message').focus();});
  listen(dialog,'cancel',event=>{event.preventDefault();session.end();});
  listen(dialog,'close',()=>{if(session.snapshot().open)session.end();});
  listen(doc,'visibilitychange',()=>{if(doc.hidden)session.end();});
  listen(globalThis.window,'hashchange',()=>{if(location.hash!=='#conversation')session.end();});
  return {session,dispose(){if(disposed)return;session.end();disposed=true;release();events.abort();session.dispose();}};
}
