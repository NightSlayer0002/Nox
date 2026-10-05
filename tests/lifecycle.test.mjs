import test from 'node:test';
import assert from 'node:assert/strict';
import { createTurnGate } from '../public/js/turns.js';
import { createRecorder } from '../public/js/recorder.js';

test('reset invalidates delayed turns and aborts a pending request', () => {
  const turns = createTurnGate();
  const token = turns.begin();
  const controller = new AbortController();
  turns.attach(token, controller);
  turns.cancel();
  assert.equal(turns.isCurrent(token), false);
  assert.equal(controller.signal.aborted, true);
  const next = turns.begin();
  assert.equal(turns.isCurrent(next), true);
  assert.equal(turns.isCurrent(token), false);
});

test('a controller attached to an obsolete turn is aborted immediately', () => {
  const turns = createTurnGate();
  const token = turns.begin(); turns.cancel();
  const controller = new AbortController(); turns.attach(token, controller);
  assert.equal(controller.signal.aborted, true);
});

test('a recording stays owned until its stop event finishes', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = globalThis.MediaRecorder;
  const instances = [], streams = [];
  class RecorderDouble {
    static isTypeSupported() { return true; }
    constructor(stream) { this.stream = stream; this.state = 'inactive'; instances.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; }
    finish() { this.ondataavailable({ data: new Blob() }); this.onstop(); }
  }
  globalThis.MediaRecorder = RecorderDouble;
  try {
    const canvas = { captureStream() { const track = { stopped: false, stop() { this.stopped = true; } }; const stream = { getTracks: () => [track], track }; streams.push(stream); return stream; } };
    const recorder = createRecorder(canvas, () => {});
    recorder.start(); recorder.stop();
    assert.equal(recorder.active, true, 'stopping is still an active session');
    assert.throws(() => recorder.start(), /saving|finish/i);
    assert.equal(streams.length, 1);
    instances[0].finish();
    assert.equal(streams[0].track.stopped, true);
    assert.equal(recorder.active, false);
    recorder.start();
    assert.equal(streams.length, 2);
    assert.equal(streams[1].track.stopped, false);
    recorder.stop(); instances[1].finish();
  } finally { globalThis.MediaRecorder = original; }
});

test('an encoding start failure closes its capture tracks', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = globalThis.MediaRecorder;
  const track = { stopped: false, stop() { this.stopped = true; } };
  class RecorderDouble {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; }
    start() { throw new Error('cannot encode'); }
  }
  globalThis.MediaRecorder = RecorderDouble;
  try {
    const recorder = createRecorder({ captureStream: () => ({ getTracks: () => [track] }) }, () => {});
    assert.throws(() => recorder.start(), /cannot encode/);
    assert.equal(track.stopped, true);
    assert.equal(recorder.active, false);
  } finally { globalThis.MediaRecorder = original; }
});

test('a completed recording exposes its own encoded clip for preview and saving', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = globalThis.MediaRecorder;
  let encoder, clip;
  class RecorderDouble {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; encoder = this; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['encoded-test-chunk']) }); this.onstop(); }
  }
  globalThis.MediaRecorder = RecorderDouble;
  try {
    const recorder = createRecorder({ captureStream: () => ({ getTracks: () => [{ stop() {} }] }) }, (active, result) => { if (!active) clip = result; });
    recorder.start(); recorder.stop();
    assert.equal(encoder.state, 'inactive');
    assert.equal(recorder.active, false);
    assert.equal(await clip.blob.text(), 'encoded-test-chunk');
    assert.match(clip.filename, /^nox-.*\.webm$/);
    assert.match(clip.url, /^blob:/);
    URL.revokeObjectURL(clip.url);
  } finally { globalThis.MediaRecorder = original; }
});
