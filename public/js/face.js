import { OrbSignal } from './orb-state.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const tau = Math.PI * 2;

// A live, geometric character. The shared signal tracks activity; features()
// turns emotion, gaze, blinks, and temporary touch reactions into geometry.
export class Face extends OrbSignal {
  constructor() {
    super(); this.x = .5; this.y = .46; this.targetX = .5; this.targetY = .46;
    this.scale = 1; this.rotation = 0; this.gazeX = 0; this.gazeY = 0;
    this.blinkAt = 2; this.blinkStart = -100; this.winkAt = -100;
    this.pulseAt = -100; this.reactionUntil = 0; this.breath = 0; this.reduceMotion = false;
    this.signal = this.sample(0, 0);
  }
  say(text, now) { this.speakingUntil = now + Math.min(12, Math.max(2.5, text.length / 18)); }
  poke(now) { this.blinkStart = now; this.reactionUntil = now + 1.5; this.pulseAt = now; }
  wink(now) { this.winkAt = now; this.reactionUntil = now + 1.5; this.pulseAt = now; }
  update(time, dt, pointer, dragging, reduceMotion) {
    const ease = 1 - Math.exp(-Math.min(dt, .05) * 9);
    this.reduceMotion = reduceMotion;
    if (!dragging) { this.x += (this.targetX-this.x)*ease; this.y += (this.targetY-this.y)*ease; }
    if (reduceMotion) { this.gazeX = 0; this.gazeY = 0; this.breath = 0; }
    else {
      const thinking = this.activity === 'thinking';
      const gx = thinking ? Math.sin(time*2.7)*13 : clamp((pointer.x-this.x)*50, -18, 18);
      const gy = thinking ? -8 : clamp((pointer.y-this.y)*35, -12, 12);
      this.gazeX += (gx-this.gazeX)*ease; this.gazeY += (gy-this.gazeY)*ease;
      this.breath = Math.sin(time*1.5)*3.5;
      if (time >= this.blinkAt) { this.blinkStart = time; this.blinkAt = time + 2.8 + Math.random()*2.5; }
    }
    this.signal = this.sample(time, dt, reduceMotion);
  }
  features(time) {
    const emotion = time < this.reactionUntil ? 'happy' : this.emotion;
    const expression = { happy: [.73,.73], skeptical: [.44,.83], sleepy: [.18,.18], uncanny: [1.06,1.06] }[emotion] || [1,1];
    const blinkAge = time-this.blinkStart, winkAge = time-this.winkAt;
    const blink = !this.reduceMotion && blinkAge >= 0 && blinkAge < .18 ? 1-Math.sin(blinkAge/.18*Math.PI)*.97 : 1;
    const wink = winkAge >= 0 && winkAge < .42 ? this.reduceMotion ? .08 : 1-Math.sin(winkAge/.42*Math.PI)*.97 : 1;
    const talking = this.signal.status === 'speaking';
    return {
      leftHeight: 100*expression[0]*blink*wink,
      rightHeight: 100*expression[1]*blink,
      mouth: talking ? 'talking' : emotion,
      open: talking ? this.reduceMotion ? 8 : 5 + Math.abs(Math.sin(time*15)*Math.sin(time*7.7))*17 : 0,
    };
  }
  unit(width, height, scale = this.scale) { return Math.min(width/720, height/560)*scale; }
  diameter(width, height, scale = this.scale) { return this.unit(width,height,scale)*270; }
  hitTest(point, width, height) {
    const unit = this.unit(width,height);
    return Math.abs((point.x-this.x)*width) < 113*unit && Math.abs((point.y-this.y)*height) < 105*unit;
  }
  draw(ctx, width, height, time, { alpha = 1, x = this.x, y = this.y, scale = this.scale, ghost = false } = {}) {
    const unit = this.unit(width,height,scale), features = this.features(time);
    const red = this.mode === 'uncanny' || this.emotion === 'uncanny';
    const fill = ghost ? '#c7cbb4' : red ? '#efbba3' : this.mode === 'director' ? '#eeefd6' : '#fff3c9';
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(width*x, height*y + this.breath*unit); ctx.scale(unit,unit); ctx.rotate(this.rotation);
    if(!ghost) {
      ctx.fillStyle='#00000090';ctx.shadowColor='#000';ctx.shadowBlur=20;
      ctx.beginPath();ctx.ellipse(0,151,157,19,0,0,tau);ctx.fill();
      ctx.shadowBlur=0;
      const shell=ctx.createLinearGradient(-150,-100,155,140);
      shell.addColorStop(0,'#383a2f');shell.addColorStop(.18,'#161b17');shell.addColorStop(.6,'#090e0c');shell.addColorStop(1,'#262a20');
      ctx.fillStyle=shell;
      ctx.beginPath();ctx.moveTo(-145,126);ctx.bezierCurveTo(-148,52,-141,-61,-102,-106);ctx.bezierCurveTo(-55,-165,67,-165,111,-97);ctx.bezierCurveTo(145,-47,148,59,145,126);ctx.quadraticCurveTo(143,145,124,145);ctx.lineTo(-124,145);ctx.quadraticCurveTo(-145,145,-145,126);ctx.closePath();ctx.fill();
      const rim=ctx.createLinearGradient(-140,-140,150,90);rim.addColorStop(0,'#f5e6b470');rim.addColorStop(.4,'#a7997410');rim.addColorStop(1,'#eed9a84a');
      ctx.strokeStyle=rim;ctx.lineWidth=1.2;ctx.stroke();
      const highlight=ctx.createRadialGradient(-65,-90,0,-65,-90,135);highlight.addColorStop(0,'#fff3c410');highlight.addColorStop(1,'#fff3c400');ctx.fillStyle=highlight;ctx.fill();
    }
    ctx.shadowColor = red ? '#c78361' : '#f2d794';
    ctx.shadowBlur = 8 + this.signal.intensity*14;
    const surface = ctx.createLinearGradient(0,-55,0,100);
    surface.addColorStop(0,fill); surface.addColorStop(1,red ? '#d5997b' : '#e7ddae');
    ctx.fillStyle = surface;
    for (let side = 0; side < 2; side++) {
      const height = side ? features.rightHeight : features.leftHeight;
      const centre = (side ? 57 : -57) + this.gazeX;
      const offset = features.mouth === 'skeptical' && !side ? 11 : 0;
      ctx.beginPath(); ctx.roundRect(centre-23, -height/2 + this.gazeY + offset, 46, Math.max(3,height), Math.min(23,height/2)); ctx.fill();
    }
    ctx.strokeStyle = fill; ctx.fillStyle = fill; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.shadowBlur *= .4;
    const mouthX = this.gazeX*.35;
    if (features.mouth === 'talking') {
      ctx.beginPath(); ctx.ellipse(mouthX, 73+this.gazeY*.2, 11+features.open*.25, features.open/2, 0, 0, tau); ctx.fill();
    } else {
      ctx.beginPath();
      if (features.mouth === 'happy') { ctx.moveTo(mouthX-19,66); ctx.quadraticCurveTo(mouthX,88,mouthX+19,66); }
      else if (features.mouth === 'skeptical') { ctx.moveTo(mouthX-13,75); ctx.quadraticCurveTo(mouthX,76,mouthX+18,67); }
      else if (features.mouth === 'uncanny') { ctx.moveTo(mouthX-13,73); ctx.lineTo(mouthX+13,73); }
      else { ctx.ellipse(mouthX,72,10,6,0,0,tau); }
      if(['neutral','curious','sleepy'].includes(features.mouth)) ctx.fill(); else ctx.stroke();
    }
    ctx.restore();
  }
}
