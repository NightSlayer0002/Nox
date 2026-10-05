import { Orb } from './orb.js';
import { Face } from './face.js';
import { ACTIONS } from '../../shared/character.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = value => value * value * (3 - 2 * value);

export class Stage {
  constructor(canvas, onScene, {landing=false}={}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.forms = { face: new Face() }; this.form = 'face'; this.character = this.forms.face;
    this.landing=landing;
    if(landing){this.character.x=this.character.targetX=.76;this.character.y=this.character.targetY=.68;this.character.scale=.85;}
    this.pointer = { x: .5, y: .45 }; this.dragging = false; this.mode = 'companion';
    this.caption = 'Oh. You found me.'; this.captionUntil = 8;
    this.scene = null; this.started = performance.now(); this.time = 0; this.previous = 0;
    this.camera = null; this.onScene = onScene;
    if (typeof Image !== 'undefined') {
      this.backdrop = new Image(); this.backdrop.src = '/assets/nox-study.jpg';
    }
    this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.reduceMotion = this.motionQuery.matches; this.motionOverride = null;
    this.motionQuery.addEventListener('change', event => {
      if (this.motionOverride === null) { this.reduceMotion = event.matches; this.reset(); this.onMotionChange?.(!this.reduceMotion); }
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.bindPointer(); this.resize();
    requestAnimationFrame(timestamp => this.frame(timestamp));
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
    this.motionOverride = Boolean(enabled); this.reduceMotion = !this.motionOverride; this.reset();
  }
  setForm(form) {
    if (!['face', 'core'].includes(form)) return false;
    if (form === this.form) return true;
    if (!this.forms[form]) this.forms[form] = form === 'core' ? new Orb() : new Face();
    const next = this.forms[form], current = this.character;
    for (const key of ['mode','emotion','activity','speakingUntil','intensity']) next[key] = current[key];
    this.character = next; this.form = form; this.reset();
    return true;
  }
  bindPointer() {
    const locate = event => {
      const box = this.canvas.getBoundingClientRect();
      return { x: clamp((event.clientX - box.left) / box.width, 0, 1), y: clamp((event.clientY - box.top) / box.height, 0, 1) };
    };
    globalThis.document?.addEventListener('pointermove', event => {
      if (!this.dragging) this.pointer = locate(event);
    }, {passive:true});
    this.canvas.addEventListener('pointermove', event => {
      if (this.dragging && event.pointerId !== this.activePointer) return;
      this.pointer = locate(event);
      if (this.dragging) {
        this.dragDistance = Math.max(this.dragDistance, Math.hypot(event.clientX-this.pressPoint.x, event.clientY-this.pressPoint.y));
        if(this.dragDistance>=6)this.character.setHeld?.(true,this.time);
        this.character.x = clamp(this.pointer.x + this.dragOffset.x, 0, 1); this.character.y = clamp(this.pointer.y + this.dragOffset.y, 0, 1);
        this.character.targetX = this.character.x; this.character.targetY = this.character.y;
      }
    });
    this.canvas.addEventListener('pointerdown', event => {
      if (this.dragging) return;
      this.pointer = locate(event);
      if (this.character.hitTest(this.pointer, this.width, this.height)) {
        this.reset(false); this.dragging = true; this.canvas.setPointerCapture(event.pointerId);
        this.activePointer = event.pointerId;
        this.pressPoint = { x: event.clientX, y: event.clientY }; this.dragDistance = 0;
        this.dragOffset = { x: this.character.x - this.pointer.x, y: this.character.y - this.pointer.y };
      }
    });
    const release = event => {
      if (!this.dragging || event.pointerId !== this.activePointer) return;
      if (this.dragging && event.type === 'pointerup' && this.dragDistance < 6) this.character.poke(this.time);
      this.character.setHeld?.(false,this.time);
      this.dragging = false; this.activePointer = null; this.character.targetX = this.character.x; this.character.targetY = this.character.y;
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
    this.canvas.addEventListener('lostpointercapture', release);
    this.canvas.addEventListener('dblclick', () => { if (this.form === 'face') this.character.wink(this.time); else this.character.poke(this.time); });
    this.canvas.addEventListener('keydown', event => {
      const step = { ArrowLeft: [-.03, 0], ArrowRight: [.03, 0], ArrowUp: [0, -.03], ArrowDown: [0, .03] }[event.key];
      if (step) {
        event.preventDefault(); this.reset(false);
        this.character.x = clamp(this.character.x + step[0], 0, 1); this.character.y = clamp(this.character.y + step[1], 0, 1);
        this.character.targetX = this.character.x; this.character.targetY = this.character.y;
      }
      if (event.key === ' ') { event.preventDefault(); if (this.form === 'face') this.character.wink(this.time); else this.character.poke(this.time); }
    });
  }
  setMode(mode) {
    this.mode = mode; this.character.mode = mode; this.reset();
    this.character.emotion = mode === 'uncanny' ? 'uncanny' : mode === 'director' ? 'skeptical' : 'curious';
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
    if (action === 'gravity' && this.form === 'face' && !this.reduceMotion) {
      this.character.y = .28; this.character.targetY = .28; this.character.scale = .9;
    }
    this.onScene?.(action);
  }
  stopScene(action) {
    if (this.scene?.action !== action) return false;
    this.reset(); return true;
  }
  reset(recentre = true) {
    this.scene = null; this.character.scale = 1; this.character.rotation = 0;
    if (recentre) { this.dragging = false; this.character.setHeld?.(false,this.time);this.activePointer = null; this.character.targetX = .5; this.character.targetY = .46; }
    this.onScene?.('none');
  }
  frame(timestamp) {
    this.time = (timestamp - this.started) / 1000;
    const dt = Math.min(.04, Math.max(0, (timestamp - (this.previous || timestamp)) / 1000));
    this.previous = timestamp;
    this.onBeforeFrame?.(this.time,dt);
    this.animateScene(dt);
    this.character.update(this.time, dt, this.pointer, this.dragging || this.scene?.action === 'gravity', this.reduceMotion);
    if(this.renderEnabled!==false)this.render();
    this.onAfterFrame?.();
    requestAnimationFrame(next => this.frame(next));
  }
  animateScene(dt) {
    if (!this.scene) return;
    const age = this.time - this.scene.start;
    if (age > 10) { this.reset(); return; }
    if (this.reduceMotion) return;
    const enter = smooth(clamp(age / 1.3, 0, 1));
    if (this.scene.action === 'gravity' && !this.dragging) {
      this.scene.velocity += dt * 1.6;
      this.character.y += this.scene.velocity * dt;
      // Reserve the caption band below the face, including its speaking mouth.
      const floor = this.form === 'face' ? .74 - this.character.unit(this.width, this.height)*92 / this.height : .93 - this.character.diameter(this.width, this.height) * .38 / this.height;
      if (this.character.y > floor) { this.character.y = floor; this.scene.velocity = -Math.abs(this.scene.velocity) * .63; }
      this.character.targetY = this.character.y;
      this.character.rotation = Math.sin(age * 3.5) * .12 * Math.exp(-age * .4);
    }
    if (this.scene.action === 'takeover') this.takeoverPose(enter);
    if (this.scene.action === 'orbit') this.character.rotation = Math.sin(age * .5) * .04;
  }
  takeoverPose(enter){
    const unit=this.character.unit?.(this.width,this.height,1);
    const scale=this.form==='face'?Math.min(1.9,.82*this.height/(290*unit),.9*this.width/(300*unit)):1.75;
    this.character.scale=1+enter*(scale-1);
    if(this.form==='face'){this.character.targetY=.46-enter*.06;if(this.reduceMotion)this.character.y=this.character.targetY;}
  }
  render() {
    const ctx = this.ctx, w = this.width, h = this.height;
    if (!w || !h) return;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    const uncanny = this.mode === 'uncanny';
    const background = ctx.createRadialGradient(w * .5, h * .4, 0, w * .5, h * .4, w * .8);
    background.addColorStop(0, uncanny ? '#211416' : '#202527');
    background.addColorStop(.55, '#111516');
    background.addColorStop(1, '#090c0d');
    ctx.fillStyle = background; ctx.fillRect(0, 0, w, h);
    if(this.backdrop?.complete && this.backdrop.naturalWidth && this.form === 'face') {
      const image=this.backdrop, fit=Math.max(w/image.naturalWidth,h/image.naturalHeight);
      ctx.drawImage(image,(w-image.naturalWidth*fit)/2,(h-image.naturalHeight*fit)/2,image.naturalWidth*fit,image.naturalHeight*fit);
      ctx.fillStyle=uncanny?'#13070799':'#040b0860'; ctx.fillRect(0,0,w,h);
      const shade=ctx.createLinearGradient(0,0,0,h);shade.addColorStop(0,'#00000015');shade.addColorStop(.65,'#04090520');shade.addColorStop(1,'#020703ed');
      ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
    }

    const action = this.scene?.action;
    const age = this.scene ? this.time - this.scene.start : 0;
    if (action === 'orbit') this.drawOrbit(age);
    if (this.camera?.readyState >= 2) this.drawCamera(action, age);
    if (action === 'echo') {
      const appearance = this.reduceMotion ? .18 : smooth(clamp((age - 1) / 3, 0, 1)) * .22;
      this.character.draw(ctx, w, h, this.time, { x: .75, y: .29, scale: .56, alpha: appearance, ghost: true });
    }
    if(this.characterAlpha!==0)this.character.draw(ctx, w, h, this.time,{alpha:this.characterAlpha??1});
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
    ctx.font = `400 ${fontSize}px Manrope, sans-serif`; ctx.textAlign = 'center';
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
    ctx.fillStyle = '#b9beb9'; ctx.shadowColor = '#090c0d'; ctx.shadowBlur = 8;
    shown.forEach((value, index) => ctx.fillText(value, w / 2, baseline + index * fontSize * 1.4));
    ctx.shadowBlur = 0;
  }
}
