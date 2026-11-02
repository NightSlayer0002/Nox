// Only the untouched initial placement gets reading clearance. Deliberate
// dragging, Park, or gravity keeps the free overlay behavior the user chose.
export function presenceClearance({enabled,character,message,column}={}){
  if(!enabled||!character||!message||!column||message.bottom<=character.top||message.top>=character.bottom||character.left>=column.right||character.right<=column.left)return 0;
  return Math.max(0,Math.min(column.width-100,column.right-character.left+12));
}

export function attachPresenceClearance({conversation,windowTarget=window,getPlacement}){
  if(!conversation)return {update(){},dispose(){}};
  let frame=null,disposed=false;
  function update(){
    frame=null;if(disposed)return;
    const placement=getPlacement(),column=conversation.getBoundingClientRect();
    // One gutter for the transcript keeps both roles readable as it scrolls.
    // Per-message floats fed reply-follow scrolling back into their own height:
    // every reflow could move content upward and make the next float taller.
    const amount=presenceClearance({...placement,message:column,column});
    const value=amount?`${Math.ceil(amount)}px`:'';
    for(const message of conversation.querySelectorAll('.message')){
      if(message.style.marginInlineEnd!==value)message.style.marginInlineEnd=value;
      message.style.maxInlineSize=amount?`calc(100% - ${Math.ceil(amount)}px)`:'';
    }
  }
  function schedule(){if(!disposed&&frame===null)frame=windowTarget.requestAnimationFrame(update);}
  const changes=new windowTarget.MutationObserver(schedule);changes.observe(conversation,{childList:true,subtree:true,characterData:true});
  const resize=new windowTarget.ResizeObserver(schedule);resize.observe(conversation);
  conversation.addEventListener('scroll',schedule,{passive:true});
  return {update:schedule,dispose(){disposed=true;changes.disconnect();resize.disconnect();conversation.removeEventListener('scroll',schedule);if(frame!==null)windowTarget.cancelAnimationFrame(frame);for(const message of conversation.querySelectorAll('.message')){message.style.marginInlineEnd='';message.style.maxInlineSize='';}}};
}
