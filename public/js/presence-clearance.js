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
    // Measure in DOM order: wrapping one reply moves the replies below it.
    for(const message of conversation.querySelectorAll('.message')){
      const amount=presenceClearance({...placement,message:message.getBoundingClientRect(),column});
      const user=message.classList.contains('user'),value=amount&&user?`${Math.ceil(amount)}px`:'';
      if(message.style.marginInlineEnd!==value)message.style.marginInlineEnd=value;
      message.style.maxInlineSize=amount&&user?`calc(100% - ${Math.ceil(amount)}px)`:'';
      // A float excludes only the lines actually beside NOX; the rest of a
      // long answer regains its full measure below him, without a blank row.
      const content=message.querySelector('.message-content');
      const height=amount&&!user&&content?Math.max(0,placement.character.bottom-content.getBoundingClientRect().top):0;
      message.toggleAttribute('data-presence-clearance',Boolean(height));
      message.style.setProperty('--presence-clearance-width',`${Math.ceil(amount)}px`);
      message.style.setProperty('--presence-clearance-height',`${Math.ceil(height)}px`);
    }
  }
  function schedule(){if(!disposed&&frame===null)frame=windowTarget.requestAnimationFrame(update);}
  const changes=new windowTarget.MutationObserver(schedule);changes.observe(conversation,{childList:true,subtree:true,characterData:true});
  const resize=new windowTarget.ResizeObserver(schedule);resize.observe(conversation);
  conversation.addEventListener('scroll',schedule,{passive:true});
  return {update:schedule,dispose(){disposed=true;changes.disconnect();resize.disconnect();conversation.removeEventListener('scroll',schedule);if(frame!==null)windowTarget.cancelAnimationFrame(frame);for(const message of conversation.querySelectorAll('.message')){message.style.marginInlineEnd='';message.style.maxInlineSize='';message.removeAttribute('data-presence-clearance');message.style.removeProperty('--presence-clearance-width');message.style.removeProperty('--presence-clearance-height');}}};
}
