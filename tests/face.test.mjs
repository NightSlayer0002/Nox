import test from 'node:test';
import assert from 'node:assert/strict';
import { Face } from '../public/js/face.js';
import { Stage } from '../public/js/stage.js';

test('NOX visibly follows the pointer in both directions and keeps his eyes bounded', () => {
  const face = new Face();
  for (let frame = 0; frame < 30; frame++) face.update(frame / 60, 1/60, { x: 1, y: .9 }, false, false);
  assert.ok(face.gazeX > 12 && face.gazeX <= 18);
  assert.ok(face.gazeY > 5 && face.gazeY <= 12);
  for (let frame = 0; frame < 60; frame++) face.update(frame / 60, 1/60, { x: 0, y: .1 }, false, false);
  assert.ok(face.gazeX < -12 && face.gazeX >= -18);
});

test('speech animates the mouth then returns to the selected expression', () => {
  const face = new Face(); face.emotion = 'skeptical'; face.speakingUntil = .5;
  face.update(.2, .016, { x: .5, y: .46 }, false, false);
  assert.equal(face.features(.2).mouth, 'talking');
  assert.ok(face.features(.2).open > 0);
  face.update(1, .016, { x: .5, y: .46 }, false, false);
  assert.equal(face.features(1).mouth, 'skeptical');
  assert.ok(face.features(1).leftHeight < face.features(1).rightHeight);
});

test('a poke gives a temporary smile without overwriting dialogue emotion', () => {
  const face = new Face(); face.emotion = 'skeptical'; face.poke(2);
  face.update(2.3, .016, { x: .5, y: .46 }, false, false);
  assert.equal(face.features(2.3).mouth, 'happy');
  assert.equal(face.emotion, 'skeptical');
  face.update(4, .016, { x: .5, y: .46 }, false, false);
  assert.equal(face.features(4).mouth, 'skeptical');
});

test('reduced motion preserves expressions while removing gaze drift and rhythmic movement', () => {
  const face = new Face(); face.speakingUntil = Infinity;
  face.update(1, .04, { x: 1, y: 1 }, false, true);
  const first = face.features(1);
  face.update(20, .04, { x: 0, y: 0 }, false, true);
  const second = face.features(20);
  assert.equal(first.open, second.open);
  assert.equal(face.gazeX, 0); assert.equal(face.gazeY, 0); assert.equal(face.breath, 0);
});

test('changing form preserves the current conversation state and resets its scene safely', () => {
  const stage = Object.create(Stage.prototype);
  const face = new Face(), core = new Face();
  stage.forms = { face, core }; stage.character = face; stage.form = 'face';
  face.mode = 'uncanny'; face.emotion = 'happy'; face.activity = 'thinking';
  face.speakingUntil = Infinity; face.intensity = .8;
  stage.scene = { action: 'takeover' };
  assert.equal(stage.setForm('core'), true);
  assert.equal(stage.character, core); assert.equal(stage.scene, null);
  assert.equal(core.mode, 'uncanny'); assert.equal(core.emotion, 'happy');
  assert.equal(core.activity, 'thinking'); assert.equal(core.speakingUntil, Infinity); assert.equal(core.intensity, .8);
  assert.equal(stage.setForm('missing'), false); assert.equal(stage.character, core);
});

test('a wink closes only one eye and returns to his normal expression', () => {
  const face = new Face(); face.wink(1);
  face.update(1.21, .016, { x: .5, y: .46 }, false, false);
  assert.ok(face.features(1.21).leftHeight < face.features(1.21).rightHeight*.1);
  face.update(3, .016, { x: .5, y: .46 }, false, false);
  assert.equal(face.features(3).leftHeight, face.features(3).rightHeight);
});

function pointerStage() {
  const handlers = new Map(), stage = Object.create(Stage.prototype);
  stage.canvas = {
    addEventListener: (name, handler) => handlers.set(name, handler),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 580, height: 340 }),
    setPointerCapture() {},
  };
  stage.character = new Face(); stage.form = 'face'; stage.time = 5;
  stage.width = 580; stage.height = 340;
  const fire = (type, x = 290, y = 156, pointerId = 1) => handlers.get(type)({ type, clientX: x, clientY: y, pointerId });
  stage.bindPointer();
  return { stage, fire };
}

test('clicking him reacts, but pointer cancellation does not', () => {
  const { stage, fire } = pointerStage();
  fire('pointerdown'); fire('pointerup');
  assert.equal(stage.character.reactionUntil, 6.5);
  stage.time = 10;
  fire('pointerdown'); fire('pointercancel'); fire('lostpointercapture');
  assert.equal(stage.character.reactionUntil, 6.5); assert.equal(stage.dragging, false);
});

test('a drag preserves his grab offset and does not trigger a poke on release', () => {
  const { stage, fire } = pointerStage();
  fire('pointerdown', 305, 156); fire('pointermove', 390, 210); fire('pointerup', 390, 210);
  assert.ok(stage.character.x > .64); assert.ok(stage.character.y > .61);
  assert.equal(stage.character.x, stage.character.targetX);
  assert.equal(stage.character.reactionUntil, 0);
});

test('Escape reset cancels a drag and a blank release cannot undo recentering', () => {
  const { stage, fire } = pointerStage();
  fire('pointerdown'); fire('pointermove', 410, 156); stage.reset();
  assert.equal(stage.dragging, false); assert.equal(stage.character.targetX, .5);
  fire('pointerup', 410, 156);
  assert.equal(stage.character.targetX, .5);
  stage.character.x = .8; stage.reset(); fire('pointerup', 10, 10);
  assert.equal(stage.character.targetX, .5);
});

test('a second pointer cannot steal or release an active drag', () => {
  const { stage, fire } = pointerStage();
  fire('pointerdown'); fire('pointermove', 350, 180, 2); fire('pointerup', 350, 180, 2);
  assert.equal(stage.character.x, .5); assert.equal(stage.dragging, true);
  fire('pointermove', 350, 180); fire('pointerup', 350, 180);
  assert.equal(stage.dragging, false); assert.ok(stage.character.x > .6);
});

test('an explicit motion choice overrides reduced motion and resets only the scene', () => {
  const { stage } = pointerStage(); stage.reduceMotion = true; stage.character.speakingUntil = 10;
  stage.setMotion(true);
  assert.equal(stage.reduceMotion, false); assert.equal(stage.motionOverride, true);
  assert.equal(stage.character.speakingUntil, 10);
  stage.setMotion(false); assert.equal(stage.reduceMotion, true);
});

test('face scenes keep the speaking mouth above the caption band', () => {
  const { stage } = pointerStage(); stage.reduceMotion = false;
  for (const action of ['gravity', 'takeover']) {
    stage.time = 0; stage.run(action);
    for (let frame = 0; frame < 360; frame++) {
      stage.time = frame/60; stage.animateScene(1/60);
      stage.character.update(stage.time, 1/60, { x: .5, y: .46 }, stage.scene?.action === 'gravity', false);
      const mouthBottom = stage.character.y*stage.height + stage.character.unit(stage.width,stage.height)*92;
      assert.ok(mouthBottom < stage.height*.79, `${action} mouth intersects captions`);
    }
  }
});

test('only the active scene program can toggle itself off', () => {
  const { stage } = pointerStage(); stage.run('orbit');
  assert.equal(stage.stopScene('gravity'), false); assert.equal(stage.scene.action,'orbit');
  assert.equal(stage.stopScene('orbit'), true); assert.equal(stage.scene,null);
  assert.equal(stage.stopScene('orbit'), false);
});
