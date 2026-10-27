// Follow new text only while the reader is already near the end. Each DOM
// change checks the current position, including between streamed chunks.
export function attachReplyFollow({conversation,button,ResizeObserverCtor=globalThis.ResizeObserver}){
  let following=true;
  const nearEnd=()=>conversation.scrollHeight-conversation.clientHeight-conversation.scrollTop<=64;
  function latest(){following=true;conversation.scrollTop=conversation.scrollHeight;button.hidden=true;}
  function refresh(){following=nearEnd();button.hidden=following;}
  // Character clearance and viewport changes can rewrap an answer after the
  // insertion. Observe dimensions rather than adding a polling/animation loop.
  const observed=new Set(),resize=ResizeObserverCtor?new ResizeObserverCtor(()=>{if(following)latest();else button.hidden=nearEnd();}):null;
  resize?.observe(conversation);
  conversation.addEventListener('scroll',refresh,{passive:true});
  button.addEventListener('click',latest);
  return {latest,update(change){
    const wasFollowing=nearEnd();change();
    if(resize){
      for(const node of observed)if(node.parentNode!==conversation){resize.unobserve(node);observed.delete(node);}
      for(const node of conversation.children)if(!observed.has(node)){observed.add(node);resize.observe(node);}
    }
    if(wasFollowing)latest();else refresh();
  }};
}
