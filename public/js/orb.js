import {OrbSignal} from './orb-state.js';
import {drawBrainFallback} from './brain-fallback.js';
import {BrainActivity} from './brain-activity.js';
import {createFrameBudget} from './source-effects.js';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const loadBrain=options=>import('/dist/brain-character.js').then(module=>module.createBrainCharacter(options));

// Stage owns the animation clock and capture canvas; Signal adds only a
// lazily loaded, source-backed brain presentation to the existing state.
export class Orb extends OrbSignal{
  constructor({loadRenderer=loadBrain}={}){
    super();Object.assign(this,{x:.5,y:.46,targetX:.5,targetY:.46,scale:1,rotation:0,focus:{x:0,y:0,pressure:0},signal:this.sample(0,0),pulseAt:-10,renderer:{available:false},loadRenderer,neural:new BrainActivity(),held:false,falling:false,dragEnergy:0});
    this.visibilityTarget=globalThis.document;
    this.resetMaterialFrames=()=>{this.materialFrameDue=null;this.materialTick=undefined;};
    this.visibilityTarget?.addEventListener?.('visibilitychange',this.resetMaterialFrames);
  }
  loadMaterial(){
    if(this.disposed||this.loadAttempted)return this.loadingMaterial;
    this.loadAttempted=true;this.loadController=new AbortController();
    this.loadingMaterial=this.loadRenderer({signal:this.loadController.signal}).then(renderer=>{
      if(this.disposed){renderer.dispose();return;}
      this.material=renderer;this.resetMaterialFrames();
      renderer.onRestore=()=>{
        if(this.disposed||this.material!==renderer)return;
        renderer.onRestore=null;renderer.dispose();this.material=null;this.renderer.available=false;this.loadAttempted=false;this.loadMaterial();
      };
    }).catch(()=>{this.renderer.available=false;}).finally(()=>{this.loadingMaterial=null;});
    return this.loadingMaterial;
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.visibilityTarget?.removeEventListener?.('visibilitychange',this.resetMaterialFrames);this.loadController?.abort();if(this.material){this.material.onRestore=null;this.material.dispose();this.material=null;}this.renderer.available=false;}
  say(text,now){this.speakingUntil=now+Math.min(12,Math.max(2.5,text.length/18));}
  poke(now){this.pulseAt=now;this.neural.emit('poke',[this.focus.x*.4,-this.focus.y*.4,.1],1);}
  beginDrag(point,now){this.dragPrevious={point,now};this.dragEnergy=0;}
  setHeld(value){this.held=Boolean(value);}
  setFalling(value){this.falling=Boolean(value);}
  moveDrag(point,now){
    const previous=this.dragPrevious;this.dragPrevious={point,now};if(!previous)return;
    const elapsed=now-previous.now;if(!Number.isFinite(elapsed)||elapsed<=0)return;
    const dx=point.x-previous.point.x,dy=point.y-previous.point.y,speed=Math.hypot(dx,dy)/Math.max(.008,elapsed);
    this.dragEnergy=clamp(speed/1800,0,1);
    if(speed>650)this.neural.emit('drag',[clamp(dx/250,-.5,.5),clamp(-dy/250,-.5,.5),.1],.4+this.dragEnergy*.6);
  }
  release(now,{cancelled=false}={}){if(this.dragPrevious&&!cancelled)this.neural.emit('release',[0,-.25,0],.35+this.dragEnergy*.65);this.dragPrevious=null;this.held=false;}
  land(speed){if(speed>.12)this.neural.emit('impact',[0,-.45,0],clamp(speed,0,1));}
  clearTouch(){this.held=false;this.falling=false;this.dragPrevious=null;this.dragEnergy=0;this.focus.pressure=0;this.neural.clear();}
  update(time,dt,pointer,dragging,reduceMotion){
    const delta=clamp(Number.isFinite(dt)?dt:0,0,.05),ease=1-Math.exp(-delta*12);
    if(!dragging){this.x+=(this.targetX-this.x)*ease;this.y+=(this.targetY-this.y)*ease;}
    const motion=reduceMotion?0:1;
    this.focus.x+=(clamp((pointer.x-this.x)*2,-1,1)*motion-this.focus.x)*ease;
    this.focus.y+=(clamp((pointer.y-this.y)*2,-1,1)*motion-this.focus.y)*ease;
    this.focus.pressure+=((this.held?.35+this.dragEnergy*.6:0)*motion-this.focus.pressure)*ease;
    this.dragEnergy*=Math.exp(-delta*5);
    const base=this.sample(time,delta,reduceMotion),activity=this.neural.step(delta,{status:base.status,audioLevel:Number.isFinite(this.mouthLevel)?this.mouthLevel:base.envelope,reduceMotion});
    this.signal={...base,...activity};
  }
  diameter(w,h,scale=this.scale){return Math.min(w,h)*.94*scale;}
  hitTest(p,w,h){const size=this.diameter(w,h);return ((p.x-this.x)*w/(size*.39))**2+((p.y-this.y)*h/(size*.37))**2<1;}
  draw(ctx,w,h,time,{alpha=1,x=this.x,y=this.y,scale=this.scale}={}){
    if(this.disposed)return;
    const hidden=globalThis.document?.hidden;
    if(hidden)this.resetMaterialFrames();
    if(!this.material&&!hidden)this.loadMaterial();
    const size=this.diameter(w,h,scale),age=time-this.pulseAt,pulse=this.signal.motion&&age>=0&&age<1.8?Math.sin(age/1.8*Math.PI)*.06:0;
    if(this.material&&!hidden){
      const interval=this.material.frameInterval??1/30;
      // Restart after missed callbacks rather than carrying a render backlog.
      if(time-this.materialTick>interval*2)this.resetMaterialFrames();
      if(Number.isFinite(time))this.materialTick=time;
      if((this.materialFrameDue??=createFrameBudget(1/interval))(time*1000)){
        try{this.renderer.available=this.material.render(this.signal,this.focus);}catch{this.renderer.available=false;}
      }
    }
    ctx.save();ctx.globalAlpha=alpha*(.4+.6*clamp(this.signal.intensity??.65,0,1));ctx.translate(w*x+this.focus.x*size*.035,h*y+this.focus.y*size*.025);ctx.rotate(this.rotation);ctx.scale(1+pulse,1+pulse);
    if(this.material&&this.renderer.available)ctx.drawImage(this.material.canvas,-size/2,-size/2,size,size);
    else drawBrainFallback(ctx,size,this.signal);
    ctx.restore();
  }
}
