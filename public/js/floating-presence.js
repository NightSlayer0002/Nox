import {createFloatingDynamics} from './floating-dynamics.js';
import {createFloatingFollower,floatingBotTarget} from './floating-follower.js';
import {floatingAllowed,floatingLayout,createKeyboardTracker} from './floating-layout.js';
import {attachPresencePreview} from './presence-preview.js';
import {attachPresenceClearance} from './presence-clearance.js';

// The existing Stage is moved, never copied. Only the small character handle
// and bot receive pointer events; the viewport-sized trail layer is inert.
export function attachFloatingPresence({stage,documentTarget=document,windowTarget=window,onInspect=()=>{},onRelease=()=>{},onClear=()=>{}}){
  const doc=documentTarget,win=windowTarget,$=id=>doc.getElementById(id),world=$('world'),toolbar=$('presence-toolbar'),menu=$('presence-menu'),panel=$('presence-menu-panel');
  const events=new AbortController(),listen=(node,type,fn,options={})=>node?.addEventListener(type,fn,{...options,signal:events.signal});
  const compact=win.matchMedia('(max-width:600px)'),reduced=win.matchMedia('(prefers-reduced-motion: reduce)');
  const reduceMotion=()=>stage.motionOverride==null?reduced.matches:!stage.motionOverride;
  const keyboard=createKeyboardTracker(),motion=createFloatingDynamics({size:96}),follower=createFloatingFollower();
  const layer=doc.createElement('div');layer.className='floating-ui';layer.hidden=true;
  const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('floating-bot-trail');svg.setAttribute('aria-hidden','true');
  const segments=Array.from({length:23},()=>{const line=doc.createElementNS('http://www.w3.org/2000/svg','line');svg.append(line);return line;});
  const handle=doc.createElement('button');handle.type='button';handle.className='floating-nox-handle';
  handle.setAttribute('aria-label','NOX. Drag to place, hold over a message for actions. Arrow keys move, Enter greets, Space winks.');
  const hint=doc.createElement('span');hint.className='sr-only';hint.id='floating-instructions';hint.textContent='Gravity makes NOX fall onto the message composer. His smaller bot opens controls. Use Park to bring him back.';
  handle.setAttribute('aria-describedby',hint.id);
  const marker=doc.createComment('NOX conversation stage home'),toolbarMarker=doc.createComment('NOX controls home');
  world.before(marker);toolbar.before(toolbarMarker);world.append(handle);layer.append(svg,hint);doc.body.append(layer);
  const utilities=doc.createElement('div');utilities.className='floating-utilities';
  function utility(label,icon,action){const button=doc.createElement('button');button.type='button';const image=doc.createElement('img');image.src=icon;image.alt='';image.width=image.height=16;button.append(image,doc.createTextNode(label));listen(button,'click',()=>{menu.open=false;action();});utilities.append(button);return button;}
  utility('Park NOX','/assets/nox/park.svg',()=>park());
  utility('Hide NOX','/assets/nox/hide.svg',()=>$('presence-toggle').click());
  panel.append(utilities);
  let active=false,disposed=false,layout=null,placed=false,held=null,pressed=null,moved=false,previousGravity=false,saved=null,measureFrame=null,lastImpact=0,lastKeyboard=false;
  let bot={x:0,y:0},previousAction='none',takeoverHome=null,restorePlacement=null;
  let userPlaced=false,clearancePose='';
  const clearance=attachPresenceClearance({conversation:$('conversation'),windowTarget:win,getPlacement:()=>({enabled:active&&!userPlaced&&!previousGravity&&previousAction!=='takeover',character:{left:motion.state.x,top:motion.state.y,right:motion.state.x+motion.state.size,bottom:motion.state.y+motion.state.size}})});
  const releasePreview=attachPresencePreview(menu,$('presence-signal-preview'));
  const beforeFrame=stage.onBeforeFrame;
  const point=event=>({x:event.clientX,y:event.clientY});
  function isEditable(element){return Boolean(element?.isContentEditable||['TEXTAREA','INPUT'].includes(element?.tagName));}
  function bounds(){
    const viewport=win.visualViewport;
    const width=viewport?.width??win.innerWidth,height=viewport?.height??win.innerHeight;
    const keyboardState=keyboard.update({width:win.innerWidth,height,layoutHeight:win.innerHeight,focused:isEditable(doc.activeElement),scale:viewport?.scale??1});
    if((viewport?.scale??1)===1){
      doc.body.dataset.keyboardOpen=String(keyboardState.open);
      doc.documentElement.style.setProperty('--workspace-height',`${Math.round(Math.min(height,win.innerHeight))}px`);
    }
    // Classify before measuring the composer; hiding bottom navigation changes
    // its floor. Suggestion-bar resizes keep the same keyboard state.
    motion.keyboard(keyboardState.open,{reduceMotion:reduceMotion()});lastKeyboard=keyboardState.open;
    const nav=$('mobile-bottom-nav')??doc.querySelector('.mobile-bottom-nav');
    return floatingLayout({viewport:{width,height,offsetLeft:viewport?.offsetLeft??0,offsetTop:viewport?.offsetTop??0},shell:$('workspace-shell').getBoundingClientRect(),header:doc.querySelector('.header').getBoundingClientRect(),welcome:doc.querySelector('.companion-welcome')?.getBoundingClientRect(),composer:$('chat-form').getBoundingClientRect(),nav:{height:nav&&win.getComputedStyle(nav).display!=='none'?nav.getBoundingClientRect().height:0},compact:compact.matches,takeover:stage.scene?.action==='takeover'});
  }
  function measure(){
    measureFrame=null;if(!active||disposed)return;
    const previousSize=motion.state.size;layout=bounds();motion.resize(layout.size);
    world.style.setProperty('--floating-size',`${layout.size}px`);
    motion.setBounds(layout.bounds);
    if(!placed){motion.place(layout.initial);placed=true;}
    if(restorePlacement){motion.place(restorePlacement);restorePlacement=null;}
    if(previousSize!==layout.size)stage.resize();
    if(menu.open)positionMenu();
    draw(0,stage.time);
  }
  function scheduleMeasure(){if(active&&measureFrame===null)measureFrame=win.requestAnimationFrame(measure);}
  function park(){if(!active)return;userPlaced=true;clearance.update();onClear();if(!layout)measure();motion.place(layout.park);stage.character.react?.('content',stage.time,.8);draw(0,stage.time);}
  function finish(cancel=false){
    if(held===null)return;
    const pointer=held;held=null;handle.dataset.dragging='false';
    if(handle.hasPointerCapture(pointer))handle.releasePointerCapture(pointer);
    motion.release({cancel});stage.character.setHeld?.(false,stage.time);
    if(moved)stage.character.release?.(stage.time,{cancelled:cancel,gravity:previousGravity});
    else if(!cancel){stage.character.poke(stage.time);stage.onGesture?.('poke');}
    onRelease({cancel});pressed=null;moved=false;
  }
  function positionMenu(){
    if(!active||!menu.open)return;
    const viewport=win.visualViewport,left=viewport?.offsetLeft??0,top=viewport?.offsetTop??0,width=viewport?.width??win.innerWidth,height=viewport?.height??win.innerHeight;
    const visibleBottom=Math.min(top+height,layout?.bounds.bottom??top+height),availableHeight=visibleBottom-top-24;
    panel.style.maxHeight=`${Math.max(100,availableHeight)}px`;
    panel.style.width=`${Math.max(0,Math.min(312,width-24))}px`;
    const rect=panel.getBoundingClientRect(),w=Math.min(312,width-24),h=Math.min(rect.height,availableHeight);
    // The bot's translated ancestor establishes this fixed menu's containing
    // block. Compensate once; the bot is frozen for the menu's lifetime.
    const anchor=toolbar.getBoundingClientRect();
    panel.style.left=`${Math.max(left+12,Math.min(bot.x-w+22,left+width-w-12))-anchor.left}px`;
    panel.style.top=`${Math.max(top+12,Math.min(bot.y+26,visibleBottom-h-12))-anchor.top}px`;
  }
  function draw(dt,time){
    if(!active||!layout)return;
    const reducedMotion=reduceMotion();
    layer.dataset.motion=reducedMotion?'reduced':'full';
    // A preference can change without a resize or keyboard transition.
    motion.keyboard(lastKeyboard,{reduceMotion:reducedMotion});
    const state=motion.step(dt);
    const pose=`${active}:${userPlaced}:${previousGravity}:${previousAction}:${win.innerWidth}:${state.x}:${state.y}:${state.size}`;
    if(pose!==clearancePose){clearancePose=pose;clearance.update();}
    world.style.transform=`translate3d(${state.x.toFixed(2)}px,${state.y.toFixed(2)}px,0)`;
    world.dataset.x=state.x.toFixed(2);world.dataset.y=state.y.toFixed(2);world.dataset.gravity=String(previousGravity);world.dataset.grounded=String(state.grounded);world.dataset.hops=String(state.hopCount);
    stage.character.setFalling?.(previousGravity&&!state.dragging&&!state.grounded&&state.vy>15);
    if(state.impact>lastImpact+.01)stage.character.land?.(.45+state.impact*.5,stage.time);
    lastImpact=state.impact;
    const target=floatingBotTarget(state,layout.bounds);
    // A menu stays anchored while open, even if gravity moves its character.
    if(!menu.open){
      const follow=follower.update({...target,time,dt,reduceMotion:reducedMotion});bot={x:follow.x,y:follow.y};
      toolbar.style.transform=`translate3d(${(bot.x-22).toFixed(2)}px,${(bot.y-22).toFixed(2)}px,0)`;
      const trail=follow.trail;
      for(let i=0;i<segments.length;i++){
        const a=trail[i],b=trail[i+1],line=segments[i];
        if(!a||!b){line.style.opacity='0';continue;}
        line.setAttribute('x1',a.x.toFixed(2));line.setAttribute('y1',a.y.toFixed(2));line.setAttribute('x2',b.x.toFixed(2));line.setAttribute('y2',b.y.toFixed(2));
        line.style.opacity=String((1-Math.max(a.age,b.age))*.38*follow.opacity);
      }
    }else for(const line of segments)line.style.opacity='0';
  }
  function sync(){
    if(disposed)return;
    const eligible=floatingAllowed({...doc.body.dataset,film:doc.body.classList.contains('film'),recording:stage.recordingLocked});
    if(eligible===active){scheduleMeasure();return;}
    active=eligible;doc.body.dataset.floating=String(active);layer.hidden=!active;
    clearance.update();
    if(active){
      saved={transparent:stage.transparent,tabIndex:stage.canvas.tabIndex,pose:{x:stage.character.x,y:stage.character.y,targetX:stage.character.targetX,targetY:stage.character.targetY,scale:stage.character.scale,rotation:stage.character.rotation}};
      layer.append(world,toolbar);stage.externalPlacement=true;stage.transparent=true;stage.canvas.tabIndex=-1;handle.hidden=false;
      previousGravity=stage.scene?.action==='gravity';motion.setGravity(previousGravity);
      menu.open=false;panel.style.left=panel.style.top=panel.style.maxHeight=panel.style.width='';
      measure();const target=floatingBotTarget(motion.state,layout.bounds);follower.reset(target);bot=target;draw(0,stage.time);stage.resize();
    }else{
      finish(true);onClear();menu.open=false;handle.hidden=true;stage.externalPlacement=false;
      if(saved){stage.transparent=saved.transparent;stage.canvas.tabIndex=saved.tabIndex;Object.assign(stage.character,saved.pose);saved=null;}
      marker.after(world);toolbarMarker.after(toolbar);
      world.style.transform='';toolbar.style.transform='';panel.style.left=panel.style.top=panel.style.maxHeight=panel.style.width='';
      if(measureFrame!==null){win.cancelAnimationFrame(measureFrame);measureFrame=null;}
      stage.resize();
    }
  }
  stage.onBeforeFrame=(time,dt)=>{
    beforeFrame?.(time,dt);if(disposed)return;
    // Recording can change without a DOM mutation.
    if(active&&stage.recordingLocked){sync();return;}
    if(!active)return;
    const gravity=stage.scene?.action==='gravity';
    if(gravity!==previousGravity){previousGravity=gravity;motion.setGravity(gravity);}
    const action=stage.scene?.action??'none';
    if(action!==previousAction){
      if(action==='takeover')takeoverHome={x:motion.state.x,y:motion.state.y};
      else if(previousAction==='takeover'&&takeoverHome){restorePlacement=takeoverHome;takeoverHome=null;}
      previousAction=action;scheduleMeasure();
    }
    const character=stage.character;
    character.x=character.targetX=.5;character.y=character.targetY=.51;character.scale=stage.form==='core'?1.06:1.85;character.rotation=0;
    stage.captionMode='hidden';stage.captionTargetEnabled=false;
    draw(dt,time);
  };
  listen(handle,'pointerdown',event=>{
    if(event.button!==0||held!==null||!active)return;
    event.preventDefault();onClear();menu.open=false;held=event.pointerId;pressed=point(event);moved=false;
    motion.grab(pressed);handle.setPointerCapture(held);handle.dataset.dragging='true';stage.character.beginDrag?.(pressed,stage.time);
    onInspect({...pressed,dragging:true});
  });
  listen(handle,'pointermove',event=>{
    if(held!==event.pointerId)return;
    event.preventDefault();const next=point(event);motion.drag(next);
    moved||=Math.hypot(next.x-pressed.x,next.y-pressed.y)>=6;
    if(moved){userPlaced=true;clearance.update();takeoverHome=null;stage.character.setHeld?.(true,stage.time);stage.character.moveDrag?.(next,stage.time);}
    onInspect({...next,dragging:true});
  });
  listen(handle,'pointerup',event=>{if(event.pointerId===held)finish(false);});
  for(const type of ['pointercancel','lostpointercapture'])listen(handle,type,event=>{if(event.pointerId===held)finish(true);});
  listen(handle,'dblclick',()=>stage.character.wink?.(stage.time));
  listen(handle,'keydown',event=>{
    const delta={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]}[event.key];
    if(delta){event.preventDefault();userPlaced=true;clearance.update();onClear();takeoverHome=null;motion.place({x:motion.state.x+delta[0],y:motion.state.y+delta[1]});draw(0,stage.time);}
    else if(event.key==='Enter'){event.preventDefault();stage.character.poke(stage.time);}
    else if(event.key===' '){event.preventDefault();stage.character.wink?.(stage.time);}
    else if(event.key==='Escape'){event.preventDefault();finish(true);onClear();park();}
  });
  listen(menu,'toggle',()=>{if(active&&menu.open)positionMenu();});
  listen(win,'resize',scheduleMeasure);listen(win.visualViewport,'resize',scheduleMeasure);listen(win.visualViewport,'scroll',scheduleMeasure);
  listen(doc,'focusin',scheduleMeasure);listen(doc,'focusout',scheduleMeasure);listen(reduced,'change',scheduleMeasure);listen(compact,'change',scheduleMeasure);
  listen(win,'blur',()=>finish(true));listen(doc,'visibilitychange',()=>{if(doc.hidden)finish(true);});
  const observer=new win.MutationObserver(sync);observer.observe(doc.body,{attributes:true,attributeFilter:['data-view','data-presence','data-call-open','class']});
  const resize=new win.ResizeObserver(scheduleMeasure);resize.observe($('chat-form'));resize.observe($('workspace-shell'));
  listen(win,'hashchange',()=>{onClear();sync();});sync();
  return {park,measure:scheduleMeasure,get active(){return active;},get state(){return {...motion.state,keyboardOpen:lastKeyboard};},dispose(){
    if(disposed)return;
    // Leave the shared Stage in its original DOM home before removing helpers.
    if(active){doc.body.dataset.presence='hidden';sync();}
    disposed=true;releasePreview();clearance.dispose();events.abort();observer.disconnect();resize.disconnect();stage.onBeforeFrame=beforeFrame;stage.externalPlacement=false;
    if(measureFrame!==null)win.cancelAnimationFrame(measureFrame);
    utilities.remove();handle.remove();layer.remove();marker.remove();toolbarMarker.remove();delete doc.body.dataset.floating;
  }};
}
