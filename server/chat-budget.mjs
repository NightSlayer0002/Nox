// Leave response/allowance overhead inside Vercel's 30-second function limit.
export const CHAT_BUDGET_MS=26000;
export const MINIMUM_FALLBACK_MS=4000;
export function createChatBudget({signal,deadlineAt,now=Date.now,budgetMs=CHAT_BUDGET_MS,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  deadlineAt=Math.min(deadlineAt??Infinity,now()+budgetMs);
  const controller=new AbortController();
  const cancel=()=>controller.abort(signal.reason);
  if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
  const timeout=()=>controller.abort(new DOMException('The reply deadline expired.','TimeoutError'));
  const remainingMs=()=>Math.max(0,deadlineAt-now());
  const timer=remainingMs()>0?setTimer(timeout,remainingMs()):null;
  if(timer===null)timeout();
  return {signal:controller.signal,deadlineAt,remainingMs,
    async run(operation){
      controller.signal.throwIfAborted();
      let aborted;
      const cancellation=new Promise((_,reject)=>{aborted=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',aborted,{once:true});});
      try{return await Promise.race([Promise.resolve().then(()=>{controller.signal.throwIfAborted();return operation();}),cancellation]);}
      finally{controller.signal.removeEventListener('abort',aborted);}
    },
    dispose(){if(timer!==null)clearTimer(timer);signal?.removeEventListener('abort',cancel);},
  };
}
