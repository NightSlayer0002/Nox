import { OrbSignal } from './orb-state.js';
import { OrbRenderer } from './orb-shader.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const tau = Math.PI * 2;
const rgb = (color, alpha = 1) => `rgba(${color.map(value => Math.round(value * 255)).join(',')},${alpha})`;

export class Orb extends OrbSignal {
  constructor() {
    super(); this.x = .5; this.y = .46; this.targetX = .5; this.targetY = .46;
    this.scale = 1; this.rotation = 0; this.focus = { x: 0, y: 0 };
    this.renderer = new OrbRenderer(); this.signal = this.sample(0, 0); this.pulseAt = -10;
  }
  say(text, now) { this.speakingUntil = now + Math.min(12, Math.max(2.5, text.length / 18)); }
  poke(now) { this.pulseAt = now; }
  update(time, dt, pointer, dragging, reduceMotion) {
    const ease = 1 - Math.exp(-dt * 8);
    if (!dragging) { this.x += (this.targetX - this.x) * ease; this.y += (this.targetY - this.y) * ease; }
    const motion = reduceMotion ? 0 : 1;
    this.focus.x += (clamp((pointer.x - this.x) * 2, -1, 1) * motion - this.focus.x) * ease;
    this.focus.y += (clamp((pointer.y - this.y) * 2, -1, 1) * motion - this.focus.y) * ease;
    this.signal = this.sample(time, dt, reduceMotion);
  }
  diameter(width, height, scale = this.scale) { return Math.min(width * .65, height * .88) * scale; }
  hitTest(point, width, height) {
    const radius = this.diameter(width, height) * .38;
    return Math.hypot((point.x-this.x)*width, (point.y-this.y)*height) < radius;
  }
  draw(ctx, width, height, time, { alpha = 1, x = this.x, y = this.y, scale = this.scale, ghost = false } = {}) {
    const size = this.diameter(width, height, scale), radius = size * .38;
    const signal = this.signal, color = signal.color;
    const motion = signal.motion ? 1 : 0, pulseAge = time - this.pulseAt;
    const breathing = 1 + motion*(Math.sin(time*1.6)*.022 + (pulseAge >= 0 && pulseAge < 1.8 ? Math.sin(pulseAge/1.8*Math.PI)*.09 : 0));
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(width*x + this.focus.x*radius*.16*motion, height*y + this.focus.y*radius*.12*motion);
    ctx.rotate(this.rotation); ctx.scale(breathing, breathing);
    // Ground reflection anchors the core in the instrument's cavity.
    const shadow = ctx.createRadialGradient(0, radius*1.2, 0, 0, radius*1.2, radius*.9);
    shadow.addColorStop(0, rgb(color, .07)); shadow.addColorStop(1, rgb(color, 0));
    ctx.save(); ctx.scale(1, .18); ctx.fillStyle = shadow; ctx.fillRect(-radius*1.8, 0, radius*3.6, radius*10); ctx.restore();
    if (!ghost) this.drawDial(ctx, radius, signal);
    // Echo copies the same material. Render once per frame at the main core's
    // resolution, so the second instance does not resize a GPU buffer twice.
    if (this.renderedAt !== time) {
      const pixels = this.diameter(width, height) * Math.min(devicePixelRatio || 1, 2);
      this.texture = this.renderer.render(signal, this.focus, pixels); this.renderedAt = time;
    }
    const texture = this.texture;
    if (texture) ctx.drawImage(texture, -size/2, -size/2, size, size);
    else this.drawFallback(ctx, radius, signal);
    // An input acknowledgement, deliberately slow and never a strobe.
    if (pulseAge >= 0 && pulseAge < 1.8) {
      ctx.strokeStyle = rgb(color, signal.motion ? (1-pulseAge/1.8)*.3 : .3); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, radius * (signal.motion ? 1 + pulseAge*.23 : 1.03), 0, tau); ctx.stroke();
    }
    ctx.restore();
  }
  drawDial(ctx, radius, signal) {
    const { color, status, clock, motion } = signal;
    ctx.lineWidth = 1;
    for (let index = 0; index < 96; index++) {
      const angle = index / 96 * tau;
      const major = index % 8 === 0;
      const inside = radius * 1.16, outside = inside + (major ? 7 : 3);
      ctx.strokeStyle = major ? '#aaaba43b' : '#aaaba41b';
      ctx.beginPath(); ctx.moveTo(Math.cos(angle)*inside, Math.sin(angle)*inside); ctx.lineTo(Math.cos(angle)*outside, Math.sin(angle)*outside); ctx.stroke();
    }
    ctx.strokeStyle = '#a6a9a319'; ctx.beginPath(); ctx.arc(0, 0, radius*1.08, 0, tau); ctx.stroke();
    if (status === 'thinking' || status === 'listening') {
      const start = motion ? clock * 1.7 : -Math.PI/2;
      ctx.strokeStyle = rgb(color, .65); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, radius*1.08, start, start + (status === 'thinking' ? .8 : 1.8)); ctx.stroke();
    }
    // A fixed index and two asymmetric arcs keep this an instrument, not a face.
    ctx.fillStyle = rgb(color, .8); ctx.fillRect(-1, -radius*1.16-13, 2, 5);
    ctx.strokeStyle = rgb(color, .28); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, radius*1.2+7, .15, .45); ctx.stroke();
  }
  drawFallback(ctx, radius, signal) {
    const { color, clock, intensity } = signal;
    const material = ctx.createRadialGradient(-radius*.35, -radius*.45, 0, 0, 0, radius);
    material.addColorStop(0, '#353a3c'); material.addColorStop(.3, '#15191b'); material.addColorStop(1, '#080b0d');
    ctx.fillStyle = material; ctx.beginPath(); ctx.arc(0, 0, radius, 0, tau); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, radius*.98, 0, tau); ctx.clip();
    for (let band = 0; band < 30; band++) {
      ctx.beginPath();
      for (let index = 0; index <= 80; index++) {
        const x = (index/80*2-1)*radius;
        const y = Math.sin(x/radius*3.5 + clock*.25 + band*.07)*radius*.2 + (band-15)*radius*.035;
        if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgb(color, (.06 + Math.sin(band*.9)**2*.13) * (.4+intensity)); ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore(); ctx.strokeStyle = '#a7b5b240'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, radius, 0, tau); ctx.stroke();
  }
}
