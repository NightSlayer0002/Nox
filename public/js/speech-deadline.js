export const SPEECH_PREPARATION_MS=25000;
// A deadline races every asynchronous boundary. Abort alone cannot settle a
// custom reader or a transport which ignores the signal.
export function createSpeechDeadline({signal,timeoutMs=SPEECH_PREPARATION_MS,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  const controller=new AbortController();let timer,settled=false;
  let reject;const stopped=new Promise((resolve,no)=>{reject=no;});
  stopped.catch(()=>{});
  const release=()=>{if(timer!==undefined)clearTimer(timer);timer=undefined;signal?.removeEventListener('abort',abort);};
  const cancel=reason=>{if(settled)return;settled=true;release();controller.abort(reason);reject(reason);};
  const abort=()=>cancel(signal.reason||new DOMException('Speech stopped.','AbortError'));
  if(signal?.aborted)abort();
  else{
    signal?.addEventListener('abort',abort,{once:true});
    timer=setTimer(()=>cancel(new DOMException('Speech preparation timed out. Captions are still available.','TimeoutError')),timeoutMs);
  }
  return {controller,signal:controller.signal,wait:value=>Promise.race([value,stopped]),
    cancel:()=>cancel(new DOMException('Speech stopped.','AbortError')),
    dispose(){release();},
  };
}
