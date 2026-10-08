// Faceless Signal form uses liquid-logo's real Chrome shader instead of the
// previous generated sphere shader. Circle input follows Liquid Glass's
// circle geometry; gesture/scene state remains NOX's existing OrbSignal.
import {OrbSignal} from './orb-state.js';
import {createLiquidLogoRenderer} from './source-effects.js';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export class Orb extends OrbSignal{
  constructor(){super();Object.assign(this,{x:.5,y:.46,targetX:.5,targetY:.46,scale:1,rotation:0,focus:{x:0,y:0},signal:this.sample(0,0),pulseAt:-10,renderer:{available:false}});
    const mask=document.createElement('canvas');mask.width=mask.height=512;const ctx=mask.getContext('2d');ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(256,256,195,0,Math.PI*2);ctx.fill();this.mask=mask;
    this.loadMaterial();
  }
  loadMaterial(){if(this.disposed||this.loadingMaterial)return;this.loadingMaterial=createLiquidLogoRenderer().then(renderer=>{if(this.disposed){renderer.dispose();return;}this.material?.dispose();this.material=renderer;this.renderer.available=true;this.renderedAt=-1;renderer.onRestore=()=>this.loadMaterial();}).catch(()=>{this.renderer.available=false;}).finally(()=>{this.loadingMaterial=null;});}
  dispose(){if(this.disposed)return;this.disposed=true;this.material?.dispose();}
  say(text,now){this.speakingUntil=now+Math.min(12,Math.max(2.5,text.length/18));}
  poke(now){this.pulseAt=now;}
  update(time,dt,pointer,dragging,reduceMotion){const ease=1-Math.exp(-dt*8);if(!dragging){this.x+=(this.targetX-this.x)*ease;this.y+=(this.targetY-this.y)*ease;}const motion=reduceMotion?0:1;this.focus.x+=(clamp((pointer.x-this.x)*2,-1,1)*motion-this.focus.x)*ease;this.focus.y+=(clamp((pointer.y-this.y)*2,-1,1)*motion-this.focus.y)*ease;this.signal=this.sample(time,dt,reduceMotion);}
  diameter(w,h,scale=this.scale){return Math.min(w*.65,h*.88)*scale;}
  hitTest(p,w,h){return Math.hypot((p.x-this.x)*w,(p.y-this.y)*h)<this.diameter(w,h)*.38;}
  draw(ctx,w,h,time,{alpha=1,x=this.x,y=this.y,scale=this.scale}={}){
    const size=this.diameter(w,h,scale),age=time-this.pulseAt,pulse=this.signal.motion&&age>=0&&age<1.8?Math.sin(age/1.8*Math.PI)*.09:0;
    if(this.material&&time-(this.renderedAt??-1)>=1/30&&!document.hidden){this.renderer.available=this.material.render(this.mask,this.signal.clock);this.renderedAt=time;}
    ctx.save();ctx.globalAlpha=alpha*(.4+.6*clamp(this.signal.intensity??.65,0,1));ctx.translate(w*x+this.focus.x*size*.06,h*y+this.focus.y*size*.05);ctx.rotate(this.rotation);ctx.scale(1+pulse,1+pulse);
    if(this.material&&this.renderer.available)ctx.drawImage(this.material.canvas,-size/2,-size/2,size,size);
    else {ctx.fillStyle='#3c8d88';ctx.beginPath();ctx.arc(0,0,size*.38,0,Math.PI*2);ctx.fill();}ctx.restore();
  }
}
