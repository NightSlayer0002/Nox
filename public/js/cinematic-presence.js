import {createFrameBudget} from './source-effects.js';

// The scene owns a render loop only while both its section and page are visible.
// Keep its local clock separate from wall time so returning to it never jumps.
export function createCinematicLoop({request=requestAnimationFrame,cancel=cancelAnimationFrame,render,presence=()=>{},fps=24}){
  let visible=false,pageVisible=true,active=false,disposed=false,motion=true,frame=null,previous=null,due=createFrameBudget(fps),elapsed=0,pending=0;
  const tick=timestamp=>{
    frame=null;if(!active||disposed)return;
    const delta=previous===null?0:Math.min(.05,Math.max(0,(timestamp-previous)/1000));previous=timestamp;
    const dt=motion?delta:0;elapsed+=dt;pending+=dt;
    if(due(timestamp)){const step=pending;pending=0;render({elapsed,dt:step,motion});}
    if(active&&!disposed)frame=request(tick);
  };
  const sync=()=>{
    const next=!disposed&&visible&&pageVisible;if(next===active)return;
    active=next;previous=null;due=createFrameBudget(fps);pending=0;
    if(frame!==null){cancel(frame);frame=null;}
    presence(active);if(active)frame=request(tick);
  };
  return {
    setVisible(value){visible=Boolean(value);sync();},
    setPageVisible(value){pageVisible=Boolean(value);sync();},
    setMotion(value){motion=Boolean(value);},
    dispose(){if(disposed)return;disposed=true;sync();},
  };
}

// Share the existing Stage's canvas/Face, expression clock and material state.
// The hero is offscreen here; only its live texture is presented in the room.
export function attachCinematicHandoff(stage,host){
  const before=stage.onBeforeFrame;
  let active=false,disposed=false,pointer={x:.5,y:.5},saved;
  const release=()=>{
    if(saved){stage.pointer=saved.pointer;stage.renderEnabled=saved.renderEnabled;stage.characterAlpha=saved.characterAlpha;stage.canvas.dataset.presence=saved.presence;if(host)host.hidden=saved.hidden;saved=null;}
    before?.call(stage,stage.time,0);
  };
  const frame=(...args)=>{
    before?.apply(stage,args);if(!active)return;
    stage.characterAlpha=1;stage.renderEnabled=true;stage.canvas.dataset.presence='cinematic';
    if(host)host.hidden=true;
    stage.pointer={x:stage.character.x+(pointer.x-.5)*.8,y:stage.character.y+(pointer.y-.5)*.6};
    stage.character.noticePointer?.(stage.pointer,stage.time);
  };
  stage.onBeforeFrame=frame;
  return {
    setActive(value){
      if(disposed||active===Boolean(value))return;active=Boolean(value);
      if(active){saved={pointer:stage.pointer,renderEnabled:stage.renderEnabled,characterAlpha:stage.characterAlpha,presence:stage.canvas.dataset.presence,hidden:host?.hidden};if(host)host.hidden=true;}
      else release();
    },
    setPointer(value){const bounded=v=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):.5;pointer={x:bounded(value.x),y:bounded(value.y)};},
    dispose(){if(disposed)return;if(active){active=false;release();}disposed=true;if(stage.onBeforeFrame===frame)stage.onBeforeFrame=before;},
  };
}
