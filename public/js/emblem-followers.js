// Three equally spaced companions orbit the emblem as it travels between chapters.
// Their paths belong to the face, independent of cursor position or page content.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const FOLLOWER_TRAIL_POINTS=60;
// Reserve a live head point and sample both ends of one second of flight.
const trailInterval=1/(FOLLOWER_TRAIL_POINTS-2);
export function createEmblemFollowers(){
  const agents=Array.from({length:3},(_,i)=>({x:0,y:0,vx:0,vy:0,angle:0,depth:0,trail:new Float32Array(FOLLOWER_TRAIL_POINTS*3),trailCount:0,trailAt:0,phase:i*Math.PI*2/3-.9}));
  const state={agents,opacity:1};let lastWidth,lastHeight,lastTime;
  return {update({pose,width,height,time,delta,reduceMotion=false}){
    const elapsed=time-(lastTime??time),reset=width!==lastWidth||height!==lastHeight||delta>.25||elapsed>.25||elapsed<0,dt=clamp(delta,0,.04);
    const cx=pose.screenX*width,cy=pose.screenY*height,t=reduceMotion?0:time;
    const faceRadius=Math.min(pose.size*width*.62,Math.min(width,height)*.38)*(1+Math.sin(t*.47)*.045);
    const radiusX=Math.min(faceRadius,Math.max(12,Math.min(cx-20,width-20-cx)));
    const radiusY=Math.min(faceRadius*.83,Math.max(12,Math.min(cy-30,height-30-cy)));
    state.opacity=pose.opacity;
    for(let i=0;i<agents.length;i++){
      const a=agents[i],theta=t*.28+a.phase;
      const tx=cx+Math.cos(theta)*radiusX,ty=cy+Math.sin(theta)*radiusY;
      if(reset||reduceMotion){a.x=tx;a.y=ty;a.vx=a.vy=0;a.trailCount=1;}
      else{
        a.vx+=(tx-a.x)*11*dt-a.vx*6.5*dt;a.vy+=(ty-a.y)*11*dt-a.vy*6.5*dt;
        const speed=Math.hypot(a.vx,a.vy),limit=Math.min(900,width*1.1);
        if(speed>limit){a.vx*=limit/speed;a.vy*=limit/speed;}
        a.x+=a.vx*dt;a.y+=a.vy*dt;
      }
      a.angle=reduceMotion?0:clamp(a.vx/800,-.3,.3);
      a.depth=Math.sin(theta*.7)*.2;
      if(reset||reduceMotion){a.trailCount=1;a.trailAt=time;for(let j=0;j<a.trail.length;j+=3){a.trail[j]=a.x;a.trail[j+1]=a.y;a.trail[j+2]=a.depth;}}
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
    }
    lastWidth=width;lastHeight=height;lastTime=time;return state;
  }};
}
