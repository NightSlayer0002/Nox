const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const validPoint=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y);
export const CINEMATIC_MOTION=Object.freeze({initialVx:.13,initialVy:.05,maxSpeed:2.8});

// Positions are on the camera-facing world plane; velocity is world units/second.
export function createCinematicDynamics({x=0,y=0,vx=.12,vy=.035,bounds:initialBounds,maxSpeed=2.2}={}){
  const limit=Math.max(0,finite(maxSpeed,2.2));
  const state={x:finite(x,0),y:finite(y,0),vx:finite(vx,0),vy:finite(vy,0),dragging:false};
  let bounds={left:-5,right:5,bottom:-3,top:3},offset={x:0,y:0},samples=[];

  function capVelocity(){
    const speed=Math.hypot(state.vx,state.vy);
    if(speed>limit){state.vx=state.vx/speed*limit;state.vy=state.vy/speed*limit;}
  }
  function clampPosition(){
    state.x=clamp(state.x,bounds.left,bounds.right);
    state.y=clamp(state.y,bounds.bottom,bounds.top);
    if(bounds.left===bounds.right)state.vx=0;
    if(bounds.bottom===bounds.top)state.vy=0;
  }
  function setBounds(next={}){
    bounds={left:finite(next.left,bounds.left),right:finite(next.right,bounds.right),bottom:finite(next.bottom,bounds.bottom),top:finite(next.top,bounds.top)};
    if(bounds.left>bounds.right)[bounds.left,bounds.right]=[bounds.right,bounds.left];
    if(bounds.bottom>bounds.top)[bounds.bottom,bounds.top]=[bounds.top,bounds.bottom];
    clampPosition();
    return state;
  }
  function sampledVelocity(){
    state.vx=0;state.vy=0;
    const last=samples.at(-1);
    if(!last)return;
    const first=samples.find(sample=>last.time-sample.time>=8);
    if(!first)return;
    const dt=(last.time-first.time)/1000;
    state.vx=(last.x-first.x)/dt;state.vy=(last.y-first.y)/dt;
    capVelocity();
  }
  function grab(point,timeMs){
    if(!validPoint(point))return false;
    offset={x:state.x-point.x,y:state.y-point.y};
    state.dragging=true;state.vx=0;state.vy=0;
    samples=Number.isFinite(timeMs)?[{x:state.x,y:state.y,time:timeMs}]:[];
    return true;
  }
  function drag(point,timeMs){
    if(!state.dragging||!validPoint(point))return false;
    state.x=point.x+offset.x;state.y=point.y+offset.y;clampPosition();
    const last=samples.at(-1),current={x:state.x,y:state.y,time:timeMs};
    if(!Number.isFinite(timeMs)){samples=[];}
    else if(!last||timeMs<=last.time||timeMs-last.time>120){samples=[current];}
    else{samples.push(current);samples=samples.filter(sample=>timeMs-sample.time<=100);}
    sampledVelocity();
    return true;
  }
  function release(timeMs,{cancel=false}={}){
    if(!state.dragging)return state;
    state.dragging=false;
    const last=samples.at(-1),age=last?timeMs-last.time:Infinity;
    if(cancel||!Number.isFinite(age)||age<0||age>90){state.vx=0;state.vy=0;}
    else sampledVelocity();
    samples=[];
    return state;
  }
  function step(elapsed){
    const dt=clamp(finite(elapsed,0),0,.05);
    if(state.dragging||!dt)return state;
    const damping=Math.exp(-.12*dt),travel=(1-damping)/.12;
    state.x+=state.vx*travel;state.y+=state.vy*travel;
    state.vx*=damping;state.vy*=damping;
    if(state.x<bounds.left){state.x=bounds.left;state.vx=Math.abs(state.vx)*.78;}
    else if(state.x>bounds.right){state.x=bounds.right;state.vx=-Math.abs(state.vx)*.78;}
    if(state.y<bounds.bottom){state.y=bounds.bottom;state.vy=Math.abs(state.vy)*.78;}
    else if(state.y>bounds.top){state.y=bounds.top;state.vy=-Math.abs(state.vy)*.78;}
    clampPosition();
    return state;
  }
  setBounds(initialBounds);capVelocity();
  return {state,grab,drag,release,step,setBounds};
}
