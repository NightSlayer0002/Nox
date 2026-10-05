import test from 'node:test';
import assert from 'node:assert/strict';
import { OrbSignal } from '../public/js/orb-state.js';
import { Stage } from '../public/js/stage.js';

test('the orb follows actual interaction state and returns to idle', () => {
  const signal = new OrbSignal();
  signal.speakingUntil = 8;
  assert.equal(signal.sample(2, .016).status, 'speaking');
  signal.activity = 'thinking';
  assert.equal(signal.sample(2, .016).status, 'thinking');
  signal.activity = 'listening';
  assert.equal(signal.sample(2, .016).status, 'listening');
  signal.activity = 'idle';
  assert.equal(signal.sample(9, .016).status, 'idle');
});

test('uncanny stays red even when a reply is happy; normal palettes stay warm', () => {
  const signal = new OrbSignal();
  signal.mode = 'uncanny'; signal.emotion = 'happy';
  const red = signal.sample(2, .1).color;
  assert.ok(red[0] > red[1] * 3);
  signal.mode = 'companion';
  const amber = signal.sample(2, .1).color;
  assert.ok(amber[1] > red[1]);
  assert.ok(amber[0] > amber[2]);
});

test('reduced motion freezes shader travel and speech oscillation, while state remains readable', () => {
  const signal = new OrbSignal();
  signal.speakingUntil = Infinity;
  const first = signal.sample(1, .1, true);
  const second = signal.sample(20, .1, true);
  assert.equal(first.clock, second.clock);
  assert.equal(first.envelope, second.envelope);
  assert.equal(second.status, 'speaking');
  assert.equal(second.motion, 0);
});

test('a background-tab gap cannot jump the shader clock or overshoot energy', () => {
  const signal = new OrbSignal();
  signal.activity = 'thinking';
  const frame = signal.sample(100, 100);
  assert.ok(frame.clock >= 0 && frame.clock < .2);
  assert.ok(frame.energy >= 0 && frame.energy <= 1);
  signal.intensity = 99;
  assert.ok(signal.sample(100, .016).intensity <= 1);
});

test('recording keeps one canvas size through a viewport change, then catches up on release', () => {
  let box = { width: 720, height: 480 };
  const stage = Object.create(Stage.prototype);
  stage.canvas = { width: 0, height: 0, getBoundingClientRect: () => box };
  const previousRatio = globalThis.devicePixelRatio;
  globalThis.devicePixelRatio = 2;
  try {
    stage.resize();
    stage.lockRecording(true);
    box = { width: 390, height: 693.333 };
    stage.resize();
    assert.equal(stage.canvas.width, 1440);
    assert.equal(stage.canvas.height, 960);
    assert.equal(stage.width, 720);
    stage.lockRecording(false);
    assert.equal(stage.canvas.width, 780);
    assert.equal(stage.canvas.height, 1387);
    assert.equal(stage.width, 390);
  } finally {
    if (previousRatio === undefined) delete globalThis.devicePixelRatio;
    else globalThis.devicePixelRatio = previousRatio;
  }
});

test('keyboard users can move the core and acknowledge it with a pulse', () => {
  const handlers = new Map();
  const stage = Object.create(Stage.prototype);
  stage.canvas = { addEventListener: (name, callback) => handlers.set(name, callback) };
  stage.character = { x: .5, y: .46, targetX: .5, targetY: .46, poke(now) { this.pulseAt = now; } };
  stage.time = 3; stage.scene = { action: 'echo' };
  stage.bindPointer();
  const keydown = handlers.get('keydown');
  assert.equal(typeof keydown, 'function');
  let prevented = false;
  keydown({ key: 'ArrowRight', preventDefault: () => { prevented = true; } });
  assert.ok(prevented);
  assert.equal(stage.character.x, .53);
  assert.equal(stage.character.targetX, .53);
  assert.equal(stage.scene, null);
  keydown({ key: ' ', preventDefault() {} });
  assert.equal(stage.character.pulseAt, 3);
});
