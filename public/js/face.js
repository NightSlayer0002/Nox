import { OrbSignal } from './orb-state.js';
import { EXPRESSIONS, drawBody, drawEyes, drawMouth } from './face-art.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// A live, geometric character. The shared signal tracks activity; features()
// turns emotion, gaze, blinks, and temporary touch reactions into geometry.
export class Face extends OrbSignal {
  constructor() {
    super(); this.x = .5; this.y = .46; this.targetX = .5; this.targetY = .46;
    this.scale = 1; this.rotation = 0; this.gazeX = 0; this.gazeY = 0;
    this.blinkAt = 2; this.blinkStart = -100; this.winkAt = -100;
    this.pulseAt = -100; this.reactionUntil = 0; this.breath = 0; this.reduceMotion = false;
    this.held=false;this.falling=false;this.liftTilt=0;this.pokes=[];this.squeezeUntil=0;this.reaction='happy';
    this.heldAt=0;this.lastInteraction=0;this.lastPointer=null;this.nearAt=null;this.nearReacted=false;
    this.dragPrevious=null;this.dragVector=null;this.dragStroke=0;this.reversals=[];this.impactAt=-100;this.impactStrength=0;this.bounced=false;
    this.previousActivity='idle';this.activitySince=0;
    this.previewUntil=0;this.previewExpression='neutral';
    this.annoyanceEpisodes=0;this.inAnnoyanceBurst=false;this.annoyancePose='annoyed';
    this.signal = this.sample(0, 0);
  }
  say(text, now) { this.speakingUntil = now + Math.min(12, Math.max(2.5, text.length / 18)); }
  poke(now) {
    this.previewUntil=0;
    this.lastInteraction=now;
    this.pokes=this.pokes.filter(time=>now-time<1.2);
    if(!this.pokes.length)this.inAnnoyanceBurst=false;
    this.pokes.push(now);
    if(this.reaction==='dizzy'&&now<this.reactionUntil)return;
    if(this.pokes.length>=4){
      if(!this.inAnnoyanceBurst){this.inAnnoyanceBurst=true;this.annoyanceEpisodes=(this.annoyanceEpisodes+1)%7;this.annoyancePose=this.annoyanceEpisodes===0?'pout':'annoyed';}
      this.reaction=this.annoyancePose;
    }else this.reaction='happy';
    this.squeezeUntil=this.pokes.length%2===0&&this.reaction==='happy'?now+.28:0;
    this.blinkStart=this.reaction==='pout'?-100:now;this.reactionUntil=now+(this.reaction==='happy'?1.5:2);this.pulseAt=now;
  }
  wink(now) { this.lastInteraction=now;if(['annoyed','pout','dizzy'].includes(this.reaction)&&now<this.reactionUntil)return;this.winkAt = now; this.reaction='happy';this.reactionUntil = now + 1.5; this.pulseAt = now; }
  react(expression,now,duration=1.5){
    if(!EXPRESSIONS[expression]||!Number.isFinite(now))return;
    this.lastInteraction=now;
    if(this.reaction==='dizzy'&&now<this.reactionUntil&&expression!=='dizzy')return;
    this.reaction=expression;this.reactionUntil=now+duration;
  }
  preview(expression,now){if(!EXPRESSIONS[expression])return;this.previewExpression=expression;this.previewUntil=now+4;this.lastInteraction=now;}
  setHeld(value,now=0) {if(value&&!this.held){this.heldAt=now;this.lastInteraction=now;}this.held=Boolean(value);}
  setFalling(value) {this.falling=Boolean(value);}
  beginDrag(point,now){this.previewUntil=0;this.dragPrevious={...point,time:now};this.dragVector=null;this.dragStroke=0;this.reversals=[];this.lastInteraction=now;}
  moveDrag(point,now){
    const previous=this.dragPrevious;if(!previous)return;
    const dx=point.x-previous.x,dy=point.y-previous.y,distance=Math.hypot(dx,dy),dt=now-previous.time;
    if(distance<8)return;
    this.dragPrevious={...point,time:now};this.lastInteraction=now;
    const vector={x:dx/distance,y:dy/distance,speed:distance/Math.max(.008,dt)};
    this.reversals=this.reversals.filter(time=>now-time<.5);
    const fast=dt>0&&dt<.15&&vector.speed>450;
    const reversed=this.dragVector&&vector.x*this.dragVector.x+vector.y*this.dragVector.y<-.5;
    if(reversed){
      if(fast&&this.dragVector.speed>450&&this.dragStroke>=24)this.reversals.push(now);
      this.dragStroke=fast?distance:0;
    }else this.dragStroke=fast?this.dragStroke+distance:0;
    this.dragVector=vector;
    if(this.reversals.length>=3){this.react('dizzy',now,3);this.reversals=[];}
  }
  release(now,{cancelled=false,gravity=false}={}){
    this.dragPrevious=null;this.dragVector=null;this.dragStroke=0;this.reversals=[];
    if(!cancelled&&!gravity)this.react('content',now,1);
  }
  clearTouch(){this.previewUntil=0;this.held=false;this.falling=false;this.dragPrevious=null;this.dragVector=null;this.dragStroke=0;this.reversals=[];this.reactionUntil=0;this.squeezeUntil=0;this.impactAt=-100;this.bounced=false;}
  land(speed,now){
    if(speed>.45&&now-this.impactAt>.5){this.impactAt=now;this.impactStrength=Math.min(1,speed);this.bounced=true;this.react('ouch',now,.45);}
    else if(speed<.12&&this.bounced){this.bounced=false;this.react('content',now,.9);}
  }
  noticePointer(pointer,now){
    if(!this.lastPointer||Math.hypot(pointer.x-this.lastPointer.x,pointer.y-this.lastPointer.y)>.003){this.lastInteraction=now;this.lastPointer={...pointer};}
    const near=Math.hypot(pointer.x-this.x,pointer.y-this.y)<.09;
    if(near&&this.nearAt===null)this.nearAt=now;
    if(!near){this.nearAt=null;this.nearReacted=false;}
  }
  update(time, dt, pointer, dragging, reduceMotion) {
    const ease = 1 - Math.exp(-Math.min(dt, .05) * 9);
    this.reduceMotion = reduceMotion;
    if(this.activity!==this.previousActivity){this.previousActivity=this.activity;this.activitySince=time;this.lastInteraction=time;}
    if(this.activity!=='idle'||time<this.speakingUntil)this.lastInteraction=time;
    if(this.nearAt!==null&&!this.nearReacted&&!this.held&&time>=this.reactionUntil&&time-this.nearAt>.85){this.nearReacted=true;this.react('shy',time,1.4);}
    if (!dragging) { this.x += (this.targetX-this.x)*ease; this.y += (this.targetY-this.y)*ease; }
    if (reduceMotion) { this.gazeX = 0; this.gazeY = 0; this.breath = 0; }
    else {
      const thinking = this.activity === 'thinking'&&!this.held&&!this.falling;
      const gx = thinking ? Math.sin(time*2.7)*13 : clamp((pointer.x-this.x)*50, -18, 18);
      const gy = this.held||this.falling?12:thinking ? -8 : clamp((pointer.y-this.y)*35, -12, 12);
      this.gazeX += (gx-this.gazeX)*ease; this.gazeY += (gy-this.gazeY)*ease;
      this.breath = Math.sin(time*1.5)*3.5;
      if (time >= this.blinkAt) { this.blinkStart = time; this.blinkAt = time + 2.8 + Math.random()*2.5; }
    }
    const tilt=this.held&&!reduceMotion?clamp(this.gazeX/100,-.12,.12)+.07:0;
    this.liftTilt+=(tilt-this.liftTilt)*ease;
    this.signal = this.sample(time, dt, reduceMotion);
  }
  features(time) {
    const touch=time<this.reactionUntil?this.reaction:null;
    const idle=time-this.lastInteraction;
    const emotion=time<this.previewUntil?this.previewExpression:touch==='dizzy'||touch==='ouch'?touch:this.held?(time-this.heldAt>2.5?'worried':'surprised'):this.falling?'surprised':touch||
      (this.activity==='thinking'?(time-this.activitySince>7?'confused':'thinking'):this.activity==='listening'?'listening':
        this.signal.status==='idle'&&idle>=24?((idle-24)%18<2.5?'yawning':'sleepy'):this.emotion);
    const expression=EXPRESSIONS[emotion]||EXPRESSIONS.neutral;
    const blinkAge = time-this.blinkStart, winkAge = time-this.winkAt;
    const blink = !this.reduceMotion && blinkAge >= 0 && blinkAge < .18 ? 1-Math.sin(blinkAge/.18*Math.PI)*.97 : 1;
    const wink = winkAge >= 0 && winkAge < .42 ? this.reduceMotion ? .08 : 1-Math.sin(winkAge/.42*Math.PI)*.97 : 1;
    const level=typeof this.mouthLevel==='number'?clamp(this.mouthLevel,0,1):null;
    const talking = this.signal.status === 'speaking'&&(level===null||level>.015);
    const impactAge=time-this.impactAt;
    const squash=this.reduceMotion?0:impactAge>=0&&impactAge<.32?Math.sin(impactAge/.32*Math.PI)*this.impactStrength*.22:0;
    return {
      expression:emotion,brows:expression.brows,marks:expression.marks,squash,
      bodyTilt:this.reduceMotion?0:emotion==='dizzy'?Math.sin(time*3)*.07:this.liftTilt,
      eyeStyle:!this.held&&!this.falling&&time<this.squeezeUntil&&emotion!=='dizzy'?'squeezed':expression.eyes,held:this.held,falling:this.falling,
      leftHeight: 100*expression.heights[0]*blink*wink,
      rightHeight: 100*expression.heights[1]*blink,
      mouth: talking ? 'talking' : this.signal.status==='speaking'&&level!==null?'rest':emotion,
      open: talking ? level===null?(this.reduceMotion ? 8 : 5 + Math.abs(Math.sin(time*15)*Math.sin(time*7.7))*17):this.reduceMotion?8:3+level*21 : 0,
    };
  }
  unit(width, height, scale = this.scale) { return Math.min(width/720, height/560)*scale; }
  diameter(width, height, scale = this.scale) { return this.unit(width,height,scale)*270; }
  hitTest(point, width, height) {
    const unit = this.unit(width,height);
    return ((point.x-this.x)*width/(128*unit))**2+((point.y-this.y)*height/(149*unit))**2<1.1;
  }
  draw(ctx, width, height, time, { alpha = 1, x = this.x, y = this.y, scale = this.scale, ghost = false } = {}) {
    const unit=this.unit(width,height,scale),features=this.features(time);
    const red=this.mode==='uncanny'||this.emotion==='uncanny';
    const color=ghost?'#c7cbb4':red?'#efbba3':this.mode==='director'?'#eeefd6':'#fff3c9';
    ctx.save();ctx.globalAlpha=alpha;
    ctx.translate(width*x,height*y+(this.breath-(this.held&&!this.reduceMotion?7:0)+features.squash*80)*unit);
    ctx.scale(unit*(1+features.squash),unit*(1-features.squash*.6));ctx.rotate(this.rotation+features.bodyTilt);
    if(!ghost)drawBody(ctx,this.held);
    ctx.shadowColor=red?'#c78361':'#f2d794';ctx.shadowBlur=3+this.signal.intensity*6;
    drawEyes(ctx,features,this.gazeX,this.gazeY,time,color,this.reduceMotion);
    ctx.shadowBlur=2;drawMouth(ctx,features,this.gazeX,this.gazeY,color);ctx.restore();
  }
}
