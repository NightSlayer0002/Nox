const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Pure state: no browser, renderer, model, or microphone dependencies.
// Speech energy is an authored envelope; it is not audio analysis.
export class OrbSignal {
  constructor() {
    this.emotion = 'curious'; this.mode = 'companion'; this.activity = 'idle';
    this.speakingUntil = 0; this.energy = .12; this.clock = 0; this.intensity = .65;
  }
  sample(time, dt, reduceMotion = false) {
    const status = ['thinking', 'listening'].includes(this.activity) ? this.activity : time < this.speakingUntil ? 'speaking' : 'idle';
    const envelope = reduceMotion ? .35 : (.5 + .5 * Math.sin(time * 11.7)) * (.65 + .35 * Math.sin(time * 7.3));
    const target = status === 'speaking' ? .3 + envelope * .55 : status === 'thinking' ? .48 : status === 'listening' ? .65 : this.emotion === 'sleepy' ? .04 : .12;
    const delta = clamp(Number.isFinite(dt) ? dt : 0, 0, .05);
    this.energy += (target - this.energy) * (1 - Math.exp(-delta * 6));
    if (!reduceMotion) this.clock += delta * (status === 'thinking' ? 1.3 : this.emotion === 'sleepy' ? .18 : .55);
    const red = this.mode === 'uncanny' || this.emotion === 'uncanny';
    const color = red ? [1, .12, .065] : this.mode === 'director' ? [.72, .82, .88] : this.emotion === 'happy' ? [1, .68, .3] : [1, .48, .17];
    return { status, clock: this.clock, energy: this.energy, envelope, color, motion: reduceMotion ? 0 : 1, intensity: clamp(this.intensity, 0, 1) };
  }
}
