// A small, deterministic swarm in the existing SVG emblem's local coordinates.
// The shared anchor follows the scroll pose with drag; each light wanders near
// an eye or the smile, rather than filling the page with background particles.
export function createEmblemFireflies(count=24){
  const state={positions:new Float32Array(count*3),glows:new Float32Array(count),center:{x:0,y:0},scale:1,opacity:0};
  const seeds=Array.from({length:count},(_,i)=>({phase:i*2.399963,pace:.16+(i%5)*.027,radius:.6+(i%4)*.14,feature:i%3}));
  let initialized=false,lastWidth,lastHeight;
  return {update({pose,width,height,time,delta,reduceMotion=false}){
    const targetX=(pose.screenX-.5)*width,targetY=(.5-pose.screenY)*height;
    const resized=width!==lastWidth||height!==lastHeight;
    const follow=!initialized||resized||reduceMotion||delta>.25?1:1-Math.exp(-Math.max(0,delta)/.26);
    state.center.x+=(targetX-state.center.x)*follow;state.center.y+=(targetY-state.center.y)*follow;
    state.scale=pose.size*width/3.2;state.opacity=pose.opacity;
    const t=reduceMotion?0:time;
    for(let i=0;i<count;i++){
      const {phase,pace,radius,feature}=seeds[i],angle=phase+t*pace;
      const eye=feature<2,side=feature===0?-1:1;
      // The SVG's separation is expressed before its .08 geometry scale.
      const x=eye?side*(.88+pose.spread*.24):0,y=eye?.33:-1.3-pose.spread*.16;
      state.positions[i*3]=x+Math.cos(angle)*radius+Math.sin(t*.33+phase)*.14;
      state.positions[i*3+1]=y+Math.sin(angle)*(eye?1.1:.5)+Math.cos(t*.27+phase)*.12;
      state.positions[i*3+2]=.2+Math.sin(angle*.9+phase)*.65;
      state.glows[i]=.3+.7*(.5+.5*Math.sin(t*(.65+pace)+phase))**2;
    }
    initialized=true;lastWidth=width;lastHeight=height;return state;
  }};
}
