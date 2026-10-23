const ACTIONS=[['explain','Explain','brain'],['read','Read aloud','audio-lines'],['quiz','Quiz me','notebook-pen']];

// inspect receives viewport coordinates only during a deliberate drag. Dwelling
// reveals choices; only activating a choice can call onAction.
export function attachMessageCompanion({documentTarget=globalThis.document,conversation,onAction,dwellMs=650}){
  const windowTarget=documentTarget.defaultView??globalThis.window;
  const viewport=windowTarget?.visualViewport??globalThis.visualViewport;
  let timer=null,pending=null,dragging=false,disposed=false;
  let menu=null,selected=null,returnFocus=null,menuPoint=null;

  function textFor(message){
    if(!message||message.isConnected===false||conversation?.isConnected===false||!conversation?.contains(message))return null;
    const classes=message.classList;
    if(!classes?.contains('message')||(!classes.contains('user')&&!classes.contains('nox'))||classes.contains('draft')||classes.contains('system'))return null;
    const text=message.querySelector('.message-content')?.textContent;
    return typeof text==='string'&&text.trim()?text:null;
  }
  function messageAt(x,y){
    for(const element of documentTarget.elementsFromPoint?.(x,y)??[]){
      const message=element.closest?.('.message');
      if(textFor(message)!==null)return message;
    }
    return null;
  }
  function cancelDwell(){
    if(timer!==null)clearTimeout(timer);
    timer=null;pending=null;
  }
  function close(restore=true){
    const focusedInside=menu?.contains(documentTarget.activeElement),previous=returnFocus;
    menu?.remove();menu=null;selected=null;returnFocus=null;menuPoint=null;
    if(restore&&focusedInside&&previous?.isConnected!==false&&previous!==documentTarget.body)previous?.focus?.({preventScroll:true});
  }
  function positionMenu(){
    if(!menu)return;
    const visible=windowTarget?.visualViewport??globalThis.visualViewport;
    const left=visible?.offsetLeft??0,top=visible?.offsetTop??0;
    const width=visible?.width??windowTarget?.innerWidth??documentTarget.documentElement?.clientWidth??800;
    const height=visible?.height??windowTarget?.innerHeight??documentTarget.documentElement?.clientHeight??600;
    const availableWidth=Math.max(0,width-16),availableHeight=Math.max(0,height-16);
    menu.style.maxWidth=`${availableWidth}px`;menu.style.maxHeight=`${availableHeight}px`;
    const rect=menu.getBoundingClientRect();
    const menuWidth=Math.min(rect.width,availableWidth),menuHeight=Math.min(rect.height,availableHeight);
    menu.style.left=`${Math.max(left+8,Math.min(menuPoint.x,left+width-8-menuWidth))}px`;
    menu.style.top=`${Math.max(top+8,Math.min(menuPoint.y,top+height-8-menuHeight))}px`;
  }
  function show(message,point,focus=false){
    const text=textFor(message);
    if(disposed||text===null)return false;
    const previous=menu?.contains(documentTarget.activeElement)?returnFocus:documentTarget.activeElement;
    cancelDwell();close(false);returnFocus=previous;selected=message;menuPoint=point;
    menu=documentTarget.createElement('div');menu.className='message-companion-menu';
    menu.setAttribute('role','group');menu.setAttribute('aria-label','Actions for this message');
    Object.assign(menu.style,{position:'fixed',boxSizing:'border-box',overflowY:'auto'});
    for(const [kind,label,icon] of ACTIONS){
      const button=documentTarget.createElement('button');button.type='button';button.className='message-companion-action';button.dataset.action=kind;
      const image=documentTarget.createElement('img');image.src=`/vendor/lucide/${icon}.svg`;image.alt='';image.width=16;image.height=16;image.setAttribute('aria-hidden','true');
      const caption=documentTarget.createElement('span');caption.textContent=kind==='read'&&text.length>420?'Read opening':label;
      button.append(image,caption);
      button.addEventListener('click',()=>{
        const currentText=textFor(message);
        cancelDwell();close();
        if(!disposed&&currentText!==null)onAction?.({kind,message,text:currentText});
      });
      menu.append(button);
    }
    const dismiss=documentTarget.createElement('button');dismiss.type='button';dismiss.className='message-companion-close';dismiss.textContent='Close';dismiss.setAttribute('aria-label','Close message actions');
    dismiss.addEventListener('click',()=>{cancelDwell();close();});menu.append(dismiss);
    documentTarget.body.append(menu);positionMenu();
    if(focus)menu.children[0].focus({preventScroll:true});
    return true;
  }
  function outside(event){
    if(menu&&!menu.contains(event.target)){cancelDwell();close(false);}
  }
  function keydown(event){
    if(!menu||event.key!=='Escape')return;
    event.preventDefault();event.stopPropagation();cancelDwell();close();
  }
  function viewportChanged(){
    if(menu&&textFor(selected)===null)close();
    positionMenu();
  }
  documentTarget.addEventListener('pointerdown',outside);
  documentTarget.addEventListener('keydown',keydown,{capture:true});
  windowTarget?.addEventListener('resize',viewportChanged);
  viewport?.addEventListener('resize',viewportChanged);
  viewport?.addEventListener('scroll',viewportChanged);

  return {
    inspect({x,y,dragging:held}){
      if(disposed)return;
      dragging=Boolean(held);
      if(!dragging||!Number.isFinite(x)||!Number.isFinite(y)){cancelDwell();return;}
      const message=messageAt(x,y);
      if(menu){if(message===selected)return;close(false);}
      if(!message){cancelDwell();return;}
      if(pending?.message===message&&Math.hypot(x-pending.startX,y-pending.startY)<=12){pending.x=x;pending.y=y;return;}
      cancelDwell();
      const waiting={message,x,y,startX:x,startY:y};pending=waiting;
      timer=setTimeout(()=>{
        if(pending!==waiting)return;
        timer=null;pending=null;
        if(!disposed&&dragging&&textFor(message)!==null&&messageAt(waiting.x,waiting.y)===message)show(message,{x:waiting.x+12,y:waiting.y+12});
      },Math.max(0,Number.isFinite(dwellMs)?dwellMs:650));
    },
    release({cancel=false}={}){
      dragging=false;cancelDwell();
      if(cancel||menu&&textFor(selected)===null)close();
    },
    // Keyboard entry point: open immediately beside a completed message, focus
    // Explain, and return false for stale/draft/empty messages. Never sends.
    openFor(message){
      if(disposed||textFor(message)===null)return false;
      dragging=false;
      const rect=message.getBoundingClientRect();
      return show(message,{x:rect.right+8,y:rect.bottom+8},true);
    },
    clear(){dragging=false;cancelDwell();close();},
    dispose(){
      if(disposed)return;
      disposed=true;dragging=false;cancelDwell();close();
      documentTarget.removeEventListener('pointerdown',outside);
      documentTarget.removeEventListener('keydown',keydown,{capture:true});
      windowTarget?.removeEventListener('resize',viewportChanged);
      viewport?.removeEventListener('resize',viewportChanged);
      viewport?.removeEventListener('scroll',viewportChanged);
    },
  };
}
