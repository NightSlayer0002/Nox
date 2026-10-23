// Audio readiness controls presentation, never persistence or the answer text.
export function createReplyPresentation({voiceEnabled=false,isCurrent=()=>true,onReveal=()=>{},onWaiting=()=>{},maxWaitMs=4000,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let settled=false,timer=null,resolve;
  const ready=new Promise(done=>{resolve=done;});
  function finish(reason,show){
    if(settled)return false;
    settled=true;if(timer!==null)clearTimer(timer);timer=null;
    onWaiting(false);
    const current=show&&isCurrent();
    try{if(current)onReveal(reason);}finally{resolve(Boolean(current));}
    return Boolean(current);
  }
  const gate={ready,reveal:reason=>finish(reason,true),cancel:()=>finish('canceled',false)};
  if(voiceEnabled){onWaiting(true);timer=setTimer(()=>finish('timeout',true),Math.max(0,Math.min(4000,maxWaitMs)));}
  else finish('text',true);
  return gate;
}
