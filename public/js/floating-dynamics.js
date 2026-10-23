const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const validPoint=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y);
const acceleration=1500;

// Positions and bounds are CSS pixels; elapsed time is in seconds.
export function createFloatingDynamics({x=0,y=0,size=76,gravity=false}={}){
  const state={x:finite(x,0),y:finite(y,0),size:Math.max(1,finite(size,76)),vy:0,dragging:false,grounded:false,hopCount:0,impact:0};
  let bounds={left:0,top:0,right:Infinity,bottom:Infinity,floor:Infinity};
  let gravityEnabled=Boolean(gravity);
  let keyboardOpen=false,hopActive=false,reduceMotion=false,rebounded=false;
  let offset={x:0,y:0};
  const floorY=()=>Math.max(bounds.top,Math.min(bounds.floor,bounds.bottom)-state.size);
  function constrain(){
    state.x=clamp(state.x,bounds.left,Math.max(bounds.left,bounds.right-state.size));
    state.y=clamp(state.y,bounds.top,Math.max(bounds.top,bounds.bottom-state.size));
    state.grounded=false;
    const floor=floorY();
    if(gravityEnabled&&!state.dragging&&((reduceMotion&&Number.isFinite(floor))||state.y>floor||(state.y===floor&&state.vy>=0))){
      state.y=floor;state.vy=0;state.grounded=true;hopActive=false;
      if(reduceMotion)state.impact=0;
    }
  }
  function setBounds(next={}){
    const previousFloor=floorY(),wasGrounded=state.grounded;
    for(const key of Object.keys(bounds))bounds[key]=finite(next[key],bounds[key]);
    if(bounds.left>bounds.right)[bounds.left,bounds.right]=[bounds.right,bounds.left];
    if(bounds.top>bounds.bottom)[bounds.top,bounds.bottom]=[bounds.bottom,bounds.top];
    const rise=floorY()-previousFloor;
    if(gravityEnabled&&!state.dragging&&Number.isFinite(rise)&&rise<0&&(wasGrounded||hopActive))state.y+=rise;
    constrain();
    return state;
  }
  function setGravity(enabled){
    gravityEnabled=Boolean(enabled);state.vy=0;state.impact=0;hopActive=false;rebounded=false;
    constrain();
    return state;
  }
  function resize(size){
    const previous={x:state.x,y:state.y,size:state.size};
    state.size=Math.max(1,finite(size,state.size));
    if(gravityEnabled&&!state.dragging)state.y+=previous.size-state.size;
    constrain();
    if(state.dragging){offset.x+=state.x-previous.x;offset.y+=state.y-previous.y;}
    return state;
  }
  function grab(point){
    if(!validPoint(point))return false;
    offset={x:state.x-point.x,y:state.y-point.y};
    state.dragging=true;state.grounded=false;state.vy=0;state.impact=0;hopActive=false;rebounded=false;
    return true;
  }
  function drag(point){
    if(!state.dragging||!validPoint(point))return false;
    state.x=point.x+offset.x;state.y=point.y+offset.y;constrain();
    return true;
  }
  // Both normal release and pointer cancellation resume gravity from rest.
  function release({cancel=false}={}){
    state.dragging=false;state.vy=0;state.impact=0;hopActive=false;rebounded=false;
    constrain();
    return state;
  }
  function place(point){
    if(!validPoint(point))return state;
    state.x=point.x;state.y=point.y;
    return release();
  }
  function keyboard(open,{reduceMotion:reduced=false}={}){
    open=Boolean(open);
    reduceMotion=Boolean(reduced);
    if(reduceMotion)constrain();
    if(open===keyboardOpen)return state;
    keyboardOpen=open;
    if(open&&gravityEnabled&&state.grounded&&!state.dragging&&!reduceMotion){
      state.vy=-Math.sqrt(2*acceleration*8);state.grounded=false;state.impact=0;state.hopCount++;hopActive=true;
    }else if(!open&&hopActive){state.vy=Math.max(0,state.vy);hopActive=false;}
    return state;
  }
  function step(elapsed){
    const dt=clamp(finite(elapsed,0),0,.05);
    state.impact*=Math.exp(-14*dt);
    if(state.impact<.001)state.impact=0;
    if(!dt||!gravityEnabled||state.dragging||state.grounded)return state;
    state.y+=state.vy*dt+.5*acceleration*dt*dt;
    state.vy+=acceleration*dt;
    if(state.y<bounds.top){state.y=bounds.top;state.vy=Math.max(0,state.vy);}
    if(state.y>=floorY()){
      state.y=floorY();state.impact=Math.max(state.impact,clamp(state.vy/650,.12,1));
      // Keep the original landing squash and a single small rebound. Keyboard
      // hops already have their own 8px arc and do not start a second bounce.
      if(!rebounded&&!hopActive&&state.vy>300){state.vy=-Math.sqrt(2*acceleration*8);state.grounded=false;rebounded=true;}
      else{state.vy=0;state.grounded=true;}
      hopActive=false;
    }
    return state;
  }
  return {state,setBounds,setGravity,resize,grab,drag,release,place,keyboard,step};
}
