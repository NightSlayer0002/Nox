// Screen-space flight, independent of the renderer. The heads follow the face
// until a recent pointer gives them somewhere to investigate.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const contains=(r,x,y)=>x>r.left&&x<r.right&&y>r.top&&y<r.bottom;
function clearPoint(x,y,regions,width,height){
  if(!regions.some(r=>contains(r,x,y)))return {x,y};
  let best=null,distance=Infinity;
  for(const r of regions)for(const p of [{x:r.left,y},{x:r.right,y},{x,y:r.top},{x,y:r.bottom}]){
    if(p.x<20||p.x>width-20||p.y<30||p.y>height-30||regions.some(r=>contains(r,p.x,p.y)))continue;
    const d=(p.x-x)**2+(p.y-y)**2;if(d<distance){best=p;distance=d;}
  }
  return best||{x,y};
}
export const FOLLOWER_TRAIL_POINTS=60;
// Reserve a live head point and sample both ends of one second of flight.
const trailInterval=1/(FOLLOWER_TRAIL_POINTS-2);
export function createEmblemFollowers(){
  const agents=Array.from({length:3},(_,i)=>({x:0,y:0,vx:0,vy:0,angle:0,depth:0,trail:new Float32Array(FOLLOWER_TRAIL_POINTS*3),trailCount:0,trailAt:0,phase:i*2.1-.9}));
  const state={agents,opacity:1};let lastWidth,lastHeight,lastTime;
  return {update({pose,width,height,time,delta,pointer,reduceMotion=false,avoid=[]}){
    const elapsed=time-(lastTime??time),reset=width!==lastWidth||height!==lastHeight||delta>.25||elapsed>.25||elapsed<0,dt=clamp(delta,0,.04);
    const recent=pointer&&Number.isFinite(pointer.x)&&Number.isFinite(pointer.y)?Math.exp(-Math.max(0,time-(pointer.at??time)-1.2)/1.4):0;
    const attention=clamp(recent,0,1)*.88;
    const cx=pose.screenX*width*(1-attention)+(pointer?.x??0)*width*attention;
    const cy=pose.screenY*height*(1-attention)+(pointer?.y??0)*height*attention;
    const faceRadius=Math.min(pose.size*width*.62,Math.min(width,height)*.38);
    const regions=avoid.map(r=>({left:r.left-20,right:r.right+20,top:r.top-20,bottom:r.bottom+20}));
    state.opacity=pose.opacity;
    for(let i=0;i<agents.length;i++){
      const a=agents[i],t=reduceMotion?0:time,theta=t*(.24+i*.055)+a.phase;
      const radius=faceRadius*(1-attention)+(40+i*18)*attention;
      const target=clearPoint(clamp(cx+Math.cos(theta)*radius+Math.sin(t*.63+a.phase)*radius*.12,20,width-20),clamp(cy+Math.sin(theta*.83+a.phase*.2)*radius*.83+Math.cos(t*.41+a.phase)*radius*.14,30,height-30),regions,width,height);
      const tx=target.x,ty=target.y;
      if(reset||reduceMotion){a.x=tx;a.y=ty;a.vx=a.vy=0;a.trailCount=1;}
      else{
        a.vx+=(tx-a.x)*11*dt-a.vx*6.5*dt;a.vy+=(ty-a.y)*11*dt-a.vy*6.5*dt;
        const speed=Math.hypot(a.vx,a.vy),limit=Math.min(900,width*1.1);
        if(speed>limit){a.vx*=limit/speed;a.vy*=limit/speed;}
        a.x+=a.vx*dt;a.y+=a.vy*dt;
      }
      const clear=clearPoint(a.x,a.y,regions,width,height),relocated=Math.hypot(clear.x-a.x,clear.y-a.y)>40;
      if(clear.x!==a.x){a.x=clear.x;a.vx=0;}if(clear.y!==a.y){a.y=clear.y;a.vy=0;}
      a.angle=reduceMotion?0:clamp(a.vx/800,-.3,.3);
      a.depth=Math.sin(theta*.7)*.2;
      if(reset||reduceMotion||relocated){a.trailCount=1;a.trailAt=time;for(let j=0;j<a.trail.length;j+=3){a.trail[j]=a.x;a.trail[j+1]=a.y;a.trail[j+2]=a.depth;}}
      else{
        const x=a.trail[0],y=a.trail[1],z=a.trail[2];
        if(a.trailCount===1&&elapsed>0){a.trail[3]=x;a.trail[4]=y;a.trail[5]=z;a.trailCount=2;}
        while(a.trailAt+trailInterval<=time+1e-9){
          a.trailAt+=trailInterval;
          const mix=clamp((a.trailAt-lastTime)/(elapsed||1),0,1);
          a.trail.copyWithin(6,3,a.trail.length-3);
          a.trail[3]=x+(a.x-x)*mix;a.trail[4]=y+(a.y-y)*mix;a.trail[5]=z+(a.depth-z)*mix;
          a.trailCount=Math.min(FOLLOWER_TRAIL_POINTS,a.trailCount+1);
        }
        a.trail[0]=a.x;a.trail[1]=a.y;a.trail[2]=a.depth;
      }
      for(let j=1;j<a.trailCount;j++)if(regions.some(r=>contains(r,a.trail[j*3],a.trail[j*3+1]))){a.trailCount=j;break;}
    }
    lastWidth=width;lastHeight=height;lastTime=time;return state;
  }};
}
