import { Orb } from './orb.js';
import { Face } from './face.js';
import {createBlobMask} from './face-art.js';
import {createLiquidLogoRenderer} from './source-effects.js';
import { ACTIONS } from '../../shared/character.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = value => value * value * (3 - 2 * value);

export class Stage {
  constructor(canvas, onScene, {landing=false,transparent=false}={}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.events = new AbortController();
    this.forms = { face: new Face() }; this.form = 'face'; this.character = this.forms.face;
    this.landing=landing;this.transparent=transparent;
    if(landing){this.character.x=this.character.targetX=.76;this.character.y=this.character.targetY=.68;this.character.scale=.85;}
    this.pointer = { x: .5, y: .45 }; this.dragging = false; this.mode = 'companion';
    this.caption = 'Oh. You found me.'; this.captionUntil = 8;
    this.scene = null; this.started = performance.now(); this.time = 0; this.previous = 0;
    this.camera = null; this.onScene = onScene;
    this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.reduceMotion = this.motionQuery.matches; this.motionOverride = null;
    this.motionQuery.addEventListener('change', event => {
      if (this.motionOverride === null) { this.reduceMotion = event.matches; this.reset(); this.onMotionChange?.(!this.reduceMotion); }
    }, {signal:this.events.signal});
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.bindPointer(); this.resize();
    this.frameId=requestAnimationFrame(timestamp => this.frame(timestamp));
  }
  dispose() {
    if(this.disposed)return;
    this.disposed=true;
    cancelAnimationFrame(this.frameId);
    this.resizeObserver?.disconnect();
    this.events?.abort();
    this.liquidRenderer?.dispose();
    this.forms.core?.dispose();
  }
  resize() {
    if (this.recordingLocked) return;
    const box = this.canvas.getBoundingClientRect();
    this.width = box.width; this.height = box.height;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(box.width * ratio); this.canvas.height = Math.round(box.height * ratio);
    this.ratio = ratio;
  }
  lockRecording(active) {
    this.recordingLocked = active;
    if (!active) this.resize();
  }
  setMotion(enabled) {
    this.motionOverride = enabled===null?null:Boolean(enabled); this.reduceMotion = this.motionOverride===null?this.motionQuery.matches:!this.motionOverride; this.reset();
  }
  setForm(form) {
    if (!['face', 'core','liquid'].includes(form)) return false;
    if (form === this.form) return true;
    if(form==='liquid')this.prepareLiquid();
    if(form!=='core'&&this.form!=='core'){this.form=form;return true;}
    if(form==='core'&&!this.forms.core)this.forms.core=new Orb();
    const next = this.forms[form==='liquid'?'face':form], current = this.character;
    for (const key of ['mode','emotion','activity','speakingUntil','intensity']) next[key] = current[key];
    this.character = next; this.form = form; this.reset();
    return true;
  }
  prepareLiquid(){
    if(this.liquidRenderer||this.liquidLoading)return;
    this.canvas.dataset.liquid='loading';
    this.liquidLoading=createLiquidLogoRenderer().then(renderer=>{if(this.disposed){renderer.dispose();return;}this.liquidRenderer=renderer;this.liquidMask=createBlobMask();this.canvas.dataset.liquid='ready';renderer.onRestore=()=>{renderer.dispose();this.liquidRenderer=null;this.liquidLoading=null;if(!this.disposed)this.prepareLiquid();};}).catch(()=>{if(!this.disposed)this.canvas.dataset.liquid='fallback';});
  }
  setBackgroundSource(canvas){this.backgroundSource=canvas;}
  drawBackground(ctx,w,h){
    if(this.backgroundSource?.width&&this.backgroundSource?.height)ctx.drawImage(this.backgroundSource,0,0,w,h);
    else {ctx.fillStyle='#080e11';ctx.fillRect(0,0,w,h);}
  }
  bindPointer() {
    const listen=(target,type,handler,options={})=>target?.addEventListener(type,handler,{...options,...(this.events?{signal:this.events.signal}:{})});
    const eventTime=()=>Number.isFinite(this.started)?(performance.now()-this.started)/1000:this.time;
    const locate = event => {
      const box = this.canvas.getBoundingClientRect();
      return { x: clamp((event.clientX - box.left) / box.width, 0, 1), y: clamp((event.clientY - box.top) / box.height, 0, 1) };
    };
    listen(globalThis.document,'pointermove', event => {
      if (!this.dragging) { this.pointer = locate(event);this.character?.noticePointer?.(this.pointer,this.time); }
    }, {passive:true});
    listen(this.canvas,'pointermove', event => {
      if (this.dragging && event.pointerId !== this.activePointer) return;
      this.pointer = locate(event);
      if (this.dragging) {
        this.dragDistance = Math.max(this.dragDistance, Math.hypot(event.clientX-this.pressPoint.x, event.clientY-this.pressPoint.y));
        if(this.dragDistance>=6)this.character.setHeld?.(true,this.time);
        this.character.moveDrag?.({x:event.clientX,y:event.clientY},eventTime());
        this.character.x = clamp(this.pointer.x + this.dragOffset.x, 0, 1); this.character.y = clamp(this.pointer.y + this.dragOffset.y, 0, 1);
        this.character.targetX = this.character.x; this.character.targetY = this.character.y;
      }
    });
    listen(this.canvas,'pointerdown', event => {
      if (this.dragging) return;
      this.pointer = locate(event);
      if (this.character.hitTest(this.pointer, this.width, this.height)) {
        this.prepareMove(); this.dragging = true; this.canvas.setPointerCapture(event.pointerId);
        this.activePointer = event.pointerId;
        this.character.beginDrag?.({x:event.clientX,y:event.clientY},eventTime());
        this.pressPoint = { x: event.clientX, y: event.clientY }; this.dragDistance = 0;
        this.dragOffset = { x: this.character.x - this.pointer.x, y: this.character.y - this.pointer.y };
      }
    });
    const release = event => {
      if (!this.dragging || event.pointerId !== this.activePointer) return;
      if (this.dragging && event.type === 'pointerup' && this.dragDistance < 6) {this.character.poke(this.time);this.onGesture?.('poke');}
      this.character.setHeld?.(false,this.time);
      if(this.dragDistance>=6)this.character.release?.(this.time,{cancelled:event.type!=='pointerup',gravity:this.scene?.action==='gravity'});
      if(this.dragDistance>=6&&event.type==='pointerup')this.onGesture?.('drag');
      this.dragging = false; this.activePointer = null; this.character.targetX = this.character.x; this.character.targetY = this.character.y;
    };
    listen(this.canvas,'pointerup', release);
    listen(this.canvas,'pointercancel', release);
    listen(this.canvas,'lostpointercapture', release);
    listen(this.canvas,'dblclick', () => { if (this.character.wink) this.character.wink(this.time); else this.character.poke(this.time); });
    listen(this.canvas,'keydown', event => {
      const step = { ArrowLeft: [-.03, 0], ArrowRight: [.03, 0], ArrowUp: [0, -.03], ArrowDown: [0, .03] }[event.key];
      if (step) {
        event.preventDefault(); this.prepareMove();
        this.character.react?.('curious',this.time,.7);
        this.character.x = clamp(this.character.x + step[0], 0, 1); this.character.y = clamp(this.character.y + step[1], 0, 1);
        this.character.targetX = this.character.x; this.character.targetY = this.character.y;
      }
      if (event.key === ' ') { event.preventDefault(); if (this.character.wink) this.character.wink(this.time); else this.character.poke(this.time); }
    });
  }
  prepareMove() {
    if (this.scene?.action !== 'gravity') { const scale=this.character.scale;this.reset(false);if(this.landing)this.character.scale=scale;return; }
    this.scene.velocity = 0;
    this.character.rotation = 0;
    this.character.setFalling?.(false);
  }
  setMode(mode) {
    this.mode = mode; this.character.mode = mode; this.reset();
    this.character.emotion = mode === 'uncanny' ? 'uncanny' : 'curious';
  }
  speak(packet) {
    this.character.emotion = packet.emotion;
    this.character.say(packet.speech, this.time);
    this.caption = packet.speech; this.captionUntil = this.time + Math.min(25, Math.max(7, packet.speech.length / 12));
    if (packet.action !== 'none') this.run(packet.action);
  }
  run(action) {
    if (!ACTIONS.includes(action) || action === 'none') return;
    this.reset();
    this.scene = { action, start: this.time, velocity: 0 };
    if(action==='takeover'&&this.reduceMotion)this.takeoverPose(1);
    if (action === 'gravity' && this.form !== 'core' && !this.reduceMotion) {
      this.character.y = .28; this.character.targetY = .28; this.character.scale = .9;
    }
    this.onScene?.(action);
    const reaction={orbit:'excited',takeover:'mischievous',echo:'worried',spotlight:'curious'}[action];
    if(reaction)this.character.react?.(reaction,this.time,2);
  }
  stopScene(action) {
    if (this.scene?.action !== action) return false;
    this.reset(); return true;
  }
  reset(recentre = true) {
    this.scene = null; this.character.scale = 1; this.character.rotation = 0;
    this.character.setFalling?.(false);
    if (recentre) { this.dragging = false; this.character.setHeld?.(false,this.time);this.character.clearTouch?.();this.activePointer = null; this.character.targetX = .5; this.character.targetY = .46; }
    this.onScene?.('none');
  }
  frame(timestamp) {
    if(this.disposed)return;
    this.time = (timestamp - this.started) / 1000;
    const dt = Math.min(.04, Math.max(0, (timestamp - (this.previous || timestamp)) / 1000));
    this.previous = timestamp;
    this.onBeforeFrame?.(this.time,dt);
    this.materialBlend=(this.materialBlend||0)+((this.form==='liquid'?1:0)-(this.materialBlend||0))*(1-Math.exp(-dt*7));
    if(this.form==='liquid'&&this.liquidRenderer&&this.liquidMask&&this.time-(this.liquidRenderedAt??-1)>=1/30&&!document.hidden){this.liquidRenderer.render(this.liquidMask,this.time);this.liquidRenderedAt=this.time;}
    this.animateScene(dt);
    this.character.update(this.time, dt, this.pointer, this.dragging || this.scene?.action === 'gravity', this.reduceMotion);
    if(this.renderEnabled!==false)this.render();
    this.onAfterFrame?.();
    this.frameId=requestAnimationFrame(next => this.frame(next));
  }
  animateScene(dt) {
    if (!this.scene) return;
    const age = this.time - this.scene.start;
    if (age > 10 && this.scene.action !== 'gravity') { this.reset(); return; }
    if (this.reduceMotion) return;
    const enter = smooth(clamp(age / 1.3, 0, 1));
    if (this.scene.action === 'gravity') {
      if (this.dragging) { this.scene.velocity = 0; this.character.setFalling?.(false); return; }
      this.scene.velocity += dt * 1.6;
      this.character.y += this.scene.velocity * dt;
      // Reserve the caption band below the face, including its speaking mouth.
      const floor = this.form !== 'core' ? .74 - this.character.unit(this.width, this.height)*92 / this.height : .93 - this.character.diameter(this.width, this.height) * .38 / this.height;
      if (this.character.y >= floor) {
        this.character.land?.(Math.abs(this.scene.velocity),this.time);
        this.character.y = floor;
        this.scene.velocity = Math.abs(this.scene.velocity) < .12 ? 0 : -Math.abs(this.scene.velocity) * .63;
      }
      this.character.setFalling?.(this.scene.velocity > .03 && this.character.y < floor);
      this.character.targetY = this.character.y;
      this.character.rotation = Math.sin(age * 3.5) * .12 * Math.exp(-age * .4);
    }
    if (this.scene.action === 'takeover') this.takeoverPose(enter);
    if (this.scene.action === 'orbit') this.character.rotation = Math.sin(age * .5) * .04;
  }
  takeoverPose(enter){
    const unit=this.character.unit?.(this.width,this.height,1);
    const scale=this.form!=='core'?Math.min(1.9,.82*this.height/(290*unit),.9*this.width/(300*unit)):1.75;
    this.character.scale=1+enter*(scale-1);
    if(this.form!=='core'){this.character.targetY=.46-enter*.06;if(this.reduceMotion)this.character.y=this.character.targetY;}
  }
  render() {
    const ctx = this.ctx, w = this.width, h = this.height;
    if (!w || !h) return;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    const uncanny = this.mode === 'uncanny';
    ctx.clearRect(0,0,w,h);
    if(!this.transparent)this.drawBackground(ctx,w,h);

    const action = this.scene?.action;
    const age = this.scene ? this.time - this.scene.start : 0;
    if (action === 'orbit') this.drawOrbit(age);
    if (this.camera?.readyState >= 2) this.drawCamera(action, age);
    if (action === 'echo') {
      const appearance = this.reduceMotion ? .18 : smooth(clamp((age - 1) / 3, 0, 1)) * .22;
      this.character.draw(ctx, w, h, this.time, { x: .75, y: .29, scale: .56, alpha: appearance, ghost: true });
    }
    if(this.characterAlpha!==0)this.character.draw(ctx, w, h, this.time,{alpha:this.characterAlpha??1,bodyTexture:this.form!=='core'?this.liquidRenderer?.canvas:null,materialBlend:this.materialBlend??0});
    if (action === 'spotlight') {
      const radius = Math.min(w, h) * .32;
      const px = this.reduceMotion ? w * .5 : this.pointer.x * w;
      const py = this.reduceMotion ? h * .44 : this.pointer.y * h;
      const shade = ctx.createRadialGradient(px, py, radius * .15, px, py, radius);
      shade.addColorStop(0, '#050b0800'); shade.addColorStop(1, '#050b08e0');
      ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);
    }
    if (action === 'takeover') {
      ctx.fillStyle = '#c7cbc7'; ctx.font = `${Math.max(9, w / 75)}px Consolas, monospace`;
      ctx.textAlign = 'center'; ctx.fillText('CREATIVE CONTROL: NOX', w * .5, h * .15);
    }
    if (!this.landing && this.time < this.captionUntil) this.drawCaption(this.caption);
  }
  drawOrbit(age) {
    const ctx = this.ctx, w = this.width, h = this.height;
    for (let index = 0; index < 8; index++) {
      const angle = (this.reduceMotion ? 0 : age * .4) + index / 8 * Math.PI * 2;
      const x = w * (.5 + Math.cos(angle) * .31);
      const y = h * (.44 + Math.sin(angle) * .23);
      ctx.fillStyle = index % 3 ? '#9b8970' : '#edd7b3';
      ctx.shadowColor = '#b59b6d'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(x, y, index % 3 + 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
  drawCamera(action, age) {
    const ctx = this.ctx, w = this.width, h = this.height;
    const shrink = action === 'takeover' ? 1 - (this.reduceMotion?1:smooth(clamp(age / 1.3, 0, 1))) * .55 : 1;
    const cw = w * .25 * shrink, ch = cw * .75, x = w * .035, y = h * .13;
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 10); ctx.clip();
    ctx.translate(x + cw, y); ctx.scale(-1, 1);
    const aspect = this.camera.videoWidth / this.camera.videoHeight;
    const sourceWidth = this.camera.videoWidth, sourceHeight = sourceWidth / (4 / 3);
    if (aspect >= 4 / 3) ctx.drawImage(this.camera, (sourceWidth - this.camera.videoHeight * 4 / 3) / 2, 0, this.camera.videoHeight * 4 / 3, this.camera.videoHeight, 0, 0, cw, ch);
    else ctx.drawImage(this.camera, 0, (this.camera.videoHeight - sourceHeight) / 2, sourceWidth, sourceHeight, 0, 0, cw, ch);
    ctx.restore();
    ctx.strokeStyle = '#d0dfba30'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 10); ctx.stroke();
  }
  drawCaption(text) {
    const ctx = this.ctx, w = this.width, h = this.height;
    const fontSize = clamp(w / 48, 12, 17);
    ctx.font = `400 ${fontSize}px system-ui, sans-serif`; ctx.textAlign = 'center';
    const maxWidth = w * .79;
    const words = text.split(/\s+/), lines = []; let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    const shown = lines.slice(0, 4);
    if (lines.length > 4) shown[3] += '…';
    const baseline = h * .81;
    ctx.save();ctx.fillStyle='#080e11e6';ctx.beginPath();ctx.roundRect(w*.085,baseline-fontSize,w*.83,shown.length*fontSize*1.4+fontSize*.6,9);ctx.fill();ctx.restore();
    ctx.fillStyle = '#b9beb9'; ctx.shadowColor = '#090c0d'; ctx.shadowBlur = 8;
    shown.forEach((value, index) => ctx.fillText(value, w / 2, baseline + index * fontSize * 1.4));
    ctx.shadowBlur = 0;
  }
}
