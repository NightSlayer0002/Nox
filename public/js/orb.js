import {OrbSignal} from './orb-state.js';
import {drawBrainFallback} from './brain-fallback.js';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const loadBrain=options=>import('/dist/brain-character.js').then(module=>module.createBrainCharacter(options));

// Stage owns the animation clock and capture canvas; Signal adds only a
// lazily loaded, source-backed brain presentation to the existing state.
export class Orb extends OrbSignal{
  constructor({loadRenderer=loadBrain}={}){
    super();Object.assign(this,{x:.5,y:.46,targetX:.5,targetY:.46,scale:1,rotation:0,focus:{x:0,y:0},signal:this.sample(0,0),pulseAt:-10,renderer:{available:false},loadRenderer});
  }
  loadMaterial(){
    if(this.disposed||this.loadAttempted)return this.loadingMaterial;
    this.loadAttempted=true;this.loadController=new AbortController();
    this.loadingMaterial=this.loadRenderer({signal:this.loadController.signal}).then(renderer=>{
      if(this.disposed){renderer.dispose();return;}
      this.material=renderer;this.renderedAt=-1;
      renderer.onRestore=()=>{
        if(this.disposed||this.material!==renderer)return;
        renderer.onRestore=null;renderer.dispose();this.material=null;this.renderer.available=false;this.loadAttempted=false;this.loadMaterial();
      };
    }).catch(()=>{this.renderer.available=false;}).finally(()=>{this.loadingMaterial=null;});
    return this.loadingMaterial;
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.loadController?.abort();if(this.material){this.material.onRestore=null;this.material.dispose();this.material=null;}this.renderer.available=false;}
  say(text,now){this.speakingUntil=now+Math.min(12,Math.max(2.5,text.length/18));}
  poke(now){this.pulseAt=now;}
  update(time,dt,pointer,dragging,reduceMotion){const ease=1-Math.exp(-dt*8);if(!dragging){this.x+=(this.targetX-this.x)*ease;this.y+=(this.targetY-this.y)*ease;}const motion=reduceMotion?0:1;this.focus.x+=(clamp((pointer.x-this.x)*2,-1,1)*motion-this.focus.x)*ease;this.focus.y+=(clamp((pointer.y-this.y)*2,-1,1)*motion-this.focus.y)*ease;this.signal=this.sample(time,dt,reduceMotion);}
  diameter(w,h,scale=this.scale){return Math.min(w*.65,h*.88)*scale;}
  hitTest(p,w,h){const size=this.diameter(w,h);return ((p.x-this.x)*w/(size*.39))**2+((p.y-this.y)*h/(size*.37))**2<1;}
  draw(ctx,w,h,time,{alpha=1,x=this.x,y=this.y,scale=this.scale}={}){
    if(this.disposed)return;
    if(!this.material&&!globalThis.document?.hidden)this.loadMaterial();
    const size=this.diameter(w,h,scale),age=time-this.pulseAt,pulse=this.signal.motion&&age>=0&&age<1.8?Math.sin(age/1.8*Math.PI)*.06:0;
    if(this.material&&time-(this.renderedAt??-1)>=1/30&&!globalThis.document?.hidden){
      try{this.renderer.available=this.material.render(this.signal,this.focus);}catch{this.renderer.available=false;}
      this.renderedAt=time;
    }
    ctx.save();ctx.globalAlpha=alpha*(.4+.6*clamp(this.signal.intensity??.65,0,1));ctx.translate(w*x+this.focus.x*size*.035,h*y+this.focus.y*size*.025);ctx.rotate(this.rotation);ctx.scale(1+pulse,1+pulse);
    if(this.material&&this.renderer.available)ctx.drawImage(this.material.canvas,-size/2,-size/2,size,size);
    else drawBrainFallback(ctx,size,this.signal);
    ctx.restore();
  }
}
