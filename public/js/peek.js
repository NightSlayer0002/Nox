// One character, two places to draw him. The Stage remains the only animation clock.
export function createPeekState(){
  let docked=false,progress=0;
  return {
    get docked(){return docked;},get progress(){return progress;},
    update({originalBottom,scrollTop,dt,reduceMotion=false}){
      if(!docked&&originalBottom<=-12&&scrollTop>0)docked=true;
      else if(docked&&(originalBottom>=64||scrollTop<=0))docked=false;
      const target=docked?1:0;
      progress=reduceMotion?target:progress+(target-progress)*(1-Math.exp(-12*Math.min(.05,Math.max(0,dt))));
      if(Math.abs(target-progress)<.005)progress=target;
      return {docked,progress};
    },
  };
}

export function cursorForFace(client,anchor,home){
  return {x:home.x+(client.x-anchor.x)/360,y:home.y+(client.y-anchor.y)/260};
}

export function attachPeek(stage,host,canvas){
  const state=createPeekState(),ctx=canvas.getContext('2d');
  let client={x:innerWidth/2,y:innerHeight/2},pose,noticed=false;
  document.addEventListener('pointermove',event=>{client={x:event.clientX,y:event.clientY};},{passive:true});
  stage.onBeforeFrame=(_time,dt)=>{
    const room=stage.canvas.getBoundingClientRect(),face=stage.character;
    // Follow the actual character's bottom edge, including a user-dragged position.
    const originalBottom=room.top+face.y*room.height+face.unit(room.width,room.height)*165;
    const {docked,progress}=state.update({originalBottom,scrollTop:scrollY,dt,reduceMotion:stage.reduceMotion});
    stage.characterAlpha=docked?0:1-progress;
    stage.renderEnabled=room.bottom>0&&room.top<innerHeight;
    host.hidden=progress===0;host.dataset.docked=String(docked);
    stage.canvas.dataset.presence=docked?'peeking':'room';
    if(progress===0){pose=null;noticed=false;stage.pointer={x:(client.x-room.left)/Math.max(1,room.width),y:(client.y-room.top)/Math.max(1,room.height)};return;}
    const box=host.getBoundingClientRect(),unit=.42*Math.min(1,box.width/144);
    const dx=(1-progress)*box.width*.8,dy=(1-progress)*box.height*.3;
    const x=box.width*.68,y=box.height*.63;
    pose={box,unit,x,y,dx,dy,progress};
    if(progress>.5)stage.pointer=cursorForFace(client,{x:box.left+x+dx,y:box.top+y+dy},face);
    else stage.pointer={x:(client.x-room.left)/Math.max(1,room.width),y:(client.y-room.top)/Math.max(1,room.height)};
    const near=docked&&progress>.8&&client.x>=box.left&&client.x<=box.right&&client.y>=box.top&&client.y<=box.bottom;
    if(near&&!noticed&&!stage.reduceMotion)face.wink(stage.time);
    noticed=near;
  };
  stage.onAfterFrame=()=>{
    if(!pose)return;
    const {box,unit,x,y,dx,dy,progress}=pose,ratio=Math.min(devicePixelRatio||1,2);
    const width=Math.round(box.width*ratio),height=Math.round(box.height*ratio);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,box.width,box.height);
    ctx.save();ctx.translate(x+dx,y+dy);ctx.rotate(-.18);ctx.translate(-x,-y);
    stage.character.draw(ctx,box.width,box.height,stage.time,{x:x/box.width,y:y/box.height,scale:unit/stage.character.unit(box.width,box.height,1),alpha:progress});
    ctx.restore();canvas.dataset.gazeX=stage.character.gazeX.toFixed(2);canvas.dataset.gazeY=stage.character.gazeY.toFixed(2);
  };
  return state;
}
