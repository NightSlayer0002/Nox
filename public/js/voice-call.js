// A turn-based browser voice call. Microphone and playback adapters retain
// ownership of media; this controller only coordinates their lifecycle.
export function createVoiceCall({supported=false,startListening,stopListening,submit,stopReply,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let state=Object.freeze({open:false,active:false,muted:false,status:'closed',heard:'',reply:'',error:''});
  let version=0,restart=null,turn=null,disposed=false;
  const listeners=new Set();
  const canSpeak=()=>{try{return Boolean(typeof supported==='function'?supported():supported);}catch{return false;}};
  const current=token=>!disposed&&token===version&&state.open&&state.active&&!state.muted;
  function publish(patch){
    if(disposed)return state;
    state=Object.freeze({...state,...patch});
    // A view failure must not prevent microphone/cancellation cleanup.
    for(const listener of listeners){try{listener(state);}catch{}}
    return state;
  }
  function cancelRestart(){if(restart!==null){clearTimer(restart);restart=null;}}
  function invalidate(){version++;cancelRestart();turn=null;return version;}
  function stopMic(){try{stopListening?.();}catch{}}
  function stopOutput(){try{stopReply?.();}catch{}}
  function fail(message){
    if(disposed||!state.open||!state.active||state.muted)return false;
    invalidate();
    publish({status:'error',error:typeof message==='string'&&message.trim()?message.trim():'The voice call paused. Try connecting again.'});
    stopMic();stopOutput();return true;
  }
  function beginListening(token){
    if(!current(token))return false;
    if(!canSpeak()){
      publish({active:false,status:'unsupported',error:'Voice calls are unavailable in this browser. You can still type to NOX.'});
      return false;
    }
    publish({status:'connecting',error:''});
    if(!current(token))return false;
    try{
      if(typeof startListening!=='function')throw Error('The microphone could not start. Try connecting again.');
      const starting=startListening();
      Promise.resolve(starting).catch(error=>{if(current(token)&&['connecting','listening'].includes(state.status))fail(error?.message);});
      return true;
    }catch(error){if(current(token))fail(error?.message);return false;}
  }
  function queueListening(token){
    if(!current(token))return;
    cancelRestart();publish({status:'ready'});
    if(!current(token))return;
    restart=setTimer(()=>{
      // Clearing a timer alone cannot invalidate a callback already queued.
      if(!current(token))return;
      restart=null;turn=null;beginListening(token);
    },200);
  }
  function finishIfReady(work){
    if(turn!==work||!current(work.version)||!work.settled)return;
    if(work.spoke&&work.ended){if(restart===null)queueListening(work.version);}
    else if(!work.voicePending&&!work.spoke){turn=null;publish({status:'paused'});}
    else if(!work.spoke)publish({status:'preparing'});
  }
  function open(){
    if(disposed||state.open)return state;
    invalidate();
    return publish({open:true,active:false,muted:false,status:canSpeak()?'ready':'unsupported',heard:'',reply:'',error:''});
  }
  function connect(){
    if(disposed)return false;
    if(!state.open)open();
    if(state.active&&!state.muted&&['connecting','listening','thinking','preparing','speaking'].includes(state.status))return false;
    const token=invalidate();
    if(!canSpeak()){
      publish({active:false,muted:false,status:'unsupported',error:'Voice calls are unavailable in this browser. You can still type to NOX.'});
      return false;
    }
    // stopReply may emit an end callback synchronously. No turn is eligible yet.
    stopOutput();publish({active:true,muted:false,error:''});
    return beginListening(token);
  }
  function end(){
    if(disposed)return state;
    invalidate();publish({open:false,active:false,muted:false,status:'closed',error:''});
    stopMic();stopOutput();return state;
  }
  function toggleMute(){
    if(disposed||!state.open||!state.active)return state;
    const token=invalidate();
    if(state.muted){publish({muted:false,error:''});queueListening(token);}
    else{publish({muted:true,status:'muted',error:''});stopMic();stopOutput();}
    return state;
  }
  function interrupt(){
    if(disposed||!state.open||!state.active||state.muted||['connecting','listening'].includes(state.status))return false;
    const token=invalidate();publish({status:'ready',error:''});
    stopMic();stopOutput();queueListening(token);return true;
  }
  function onTranscript(value){
    if(disposed||!state.open||!state.active||state.muted||!['connecting','listening'].includes(state.status)||typeof value!=='string'||!value.trim())return false;
    const text=value.trim(),token=invalidate();
    const work={version:token,settled:false,voicePending:true,spoke:false,ended:false};turn=work;
    // Update before aborting recognition: its onend callback is not a new turn.
    publish({status:'thinking',heard:text,reply:'',error:''});stopMic();
    if(turn!==work||!current(token))return false;
    void (async()=>{
      try{
        const result=await submit(text);
        if(turn!==work||!current(token))return;
        if(!result||typeof result.reply!=='string')throw Error('NOX could not finish this reply. Try connecting again.');
        work.settled=true;work.voicePending=Boolean(result.voicePending);
        publish({reply:result.reply});finishIfReady(work);
      }catch(error){if(turn===work&&current(token))fail(error?.message);}
    })();
    return true;
  }
  function onListening(listening){
    if(disposed)return;
    if(!state.open||!state.active||state.muted){if(listening)stopMic();return;}
    if(!['connecting','listening'].includes(state.status)){if(listening)stopMic();return;}
    if(listening)publish({status:'listening'});
    else{invalidate();publish({status:'paused'});}
  }
  function onVoiceState(value){
    if(disposed||!state.open||!state.active||state.muted)return;
    let pauseMicrophone=false;
    if(!turn&&['connecting','listening'].includes(state.status)&&['preparing','speaking'].includes(value)){
      // A reply triggered elsewhere in the app must not be dictated back to NOX.
      const token=invalidate();
      turn={version:token,settled:true,voicePending:true,spoke:false,ended:false};pauseMicrophone=true;
    }
    if(!turn||!current(turn.version))return;
    if(value==='preparing'||value==='speaking'){
      cancelRestart();turn.ended=false;
      if(value==='speaking')turn.spoke=true;
      publish({status:value});
      if(pauseMicrophone)stopMic();
    }
    // ready/idle occur during preparation and between spoken chunks as well.
    // Neither state proves that this reply finished playing.
  }
  function onVoiceEnd(){
    if(!turn||!current(turn.version)||!turn.spoke||turn.ended)return;
    const work=turn;work.ended=true;
    if(!work.settled)publish({status:'thinking'});
    finishIfReady(work);
  }
  return {
    snapshot:()=>state,
    subscribe(listener){
      if(disposed||typeof listener!=='function')return ()=>{};
      listeners.add(listener);try{listener(state);}catch{}
      return ()=>listeners.delete(listener);
    },
    open,connect,end,toggleMute,interrupt,onTranscript,onListening,onVoiceState,onVoiceEnd,fail,
    dispose(){if(disposed)return;end();disposed=true;listeners.clear();},
  };
}
