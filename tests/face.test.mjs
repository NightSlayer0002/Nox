import test from 'node:test';
import assert from 'node:assert/strict';
import { Face } from '../public/js/face.js';
import { Stage } from '../public/js/stage.js';

test('pointer movement outside the canvas updates NOX gaze',()=>{
  const oldDocument=globalThis.document;
  const page=new EventTarget(), canvas=new EventTarget();
  canvas.getBoundingClientRect=()=>({left:200,top:100,width:400,height:300});
  const stage=Object.create(Stage.prototype);Object.assign(stage,{canvas,pointer:{x:.5,y:.5},dragging:false});
  globalThis.document=page;
  try {stage.bindPointer();const event=new Event('pointermove');Object.assign(event,{clientX:1100,clientY:20});page.dispatchEvent(event);
    assert.ok(stage.pointer.x>.9);assert.ok(stage.pointer.y<.1);
  }finally{globalThis.document=oldDocument;}
});

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

test('rapid pokes squeeze his eyes then annoy him, without changing dialogue emotion',()=>{
  const face=new Face();face.emotion='curious';face.poke(1);face.poke(1.2);
  assert.equal(face.features(1.25).eyeStyle,'squeezed');
  face.poke(1.4);face.poke(1.6);face.wink(1.61);
  assert.equal(face.features(1.8).mouth,'annoyed');assert.equal(face.emotion,'curious');
  assert.equal(face.features(5).mouth,'curious');
});

test('a held character looks below his hand and releases back to his normal expression',()=>{
  const face=new Face();face.emotion='skeptical';face.setHeld(true,1);
  for(let i=0;i<30;i++)face.update(1+i/60,1/60,{x:.8,y:.2},true,false);
  assert.ok(face.gazeY>10);assert.equal(face.features(1.5).mouth,'surprised');
  face.setHeld(false,2);face.update(3,1/60,{x:.5,y:.46},false,false);
  assert.equal(face.features(3).mouth,'skeptical');
});

test('audio-controlled mouth closes during a silent speaking interval',()=>{
  const face=new Face();face.speakingUntil=Infinity;face.mouthLevel=0;
  face.update(1,.016,{x:.5,y:.46},false,false);assert.equal(face.features(1).open,0);assert.equal(face.features(1).mouth,'rest');
  face.mouthLevel=.7;assert.ok(face.features(1).open>0);
  face.mouthLevel=0;assert.equal(face.features(1.1).open,0);
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
  const face = new Face(); const normal=face.features(0);face.wink(1);
  face.update(1.21, .016, { x: .5, y: .46 }, false, false);
  assert.ok(face.features(1.21).leftHeight < face.features(1.21).rightHeight*.1);
  face.update(3, .016, { x: .5, y: .46 }, false, false);
  assert.equal(face.features(3).leftHeight,normal.leftHeight);assert.equal(face.features(3).rightHeight,normal.rightHeight);
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
  assert.equal(stage.character.pokes.length,0);assert.equal(stage.character.features(stage.time).expression,'content');
});

test('a real drag activates the picked-up expression and cancellation releases it',()=>{
  const {stage,fire}=pointerStage();fire('pointerdown');fire('pointermove',350,200);
  assert.equal(stage.character.held,true);fire('pointercancel',350,200);assert.equal(stage.character.held,false);
});

test('takeover visibly fills more of the stage, including with motion disabled',()=>{
  const {stage}=pointerStage();stage.reduceMotion=true;stage.run('takeover');
  assert.ok(stage.character.scale>1.5);assert.equal(stage.scene.action,'takeover');
  stage.stopScene('takeover');assert.equal(stage.character.scale,1);
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

test('gravity survives pickup and a long hold, then resumes falling on release', () => {
  const {stage,fire}=pointerStage();stage.reduceMotion=false;stage.run('gravity');
  stage.scene.velocity=1;fire('pointerdown',290,95);fire('pointermove',350,60);
  const heldY=stage.character.y;
  stage.time=25;stage.animateScene(.04);
  assert.equal(stage.scene?.action,'gravity');assert.equal(stage.scene.velocity,0);
  assert.equal(stage.character.y,heldY);assert.equal(stage.character.held,true);
  fire('pointerup',350,60);
  for(let i=0;i<12;i++){
    stage.time+=1/60;stage.animateScene(1/60);
    stage.character.update(stage.time,1/60,{x:.5,y:0},true,false);
  }
  assert.ok(stage.character.y>heldY);assert.equal(stage.character.falling,true);
  assert.ok(stage.character.gazeY>8);assert.equal(stage.character.features(stage.time).mouth,'surprised');
  assert.equal(stage.character.reactionUntil,0);assert.equal(stage.scene.action,'gravity');
});

test('persistent gravity settles without a perpetual falling face and toggles off cleanly', () => {
  const {stage}=pointerStage();stage.reduceMotion=false;stage.run('gravity');
  for(let i=0;i<1200;i++){stage.time+=1/60;stage.animateScene(1/60);}
  assert.equal(stage.scene?.action,'gravity');assert.equal(stage.scene.velocity,0);
  assert.equal(stage.character.falling,false);
  assert.equal(stage.stopScene('gravity'),true);assert.equal(stage.scene,null);
  assert.equal(stage.character.falling,false);
});

test('cancelling a gravity drag drops him, while reset clears the falling reaction', () => {
  const {stage,fire}=pointerStage();stage.reduceMotion=false;stage.run('gravity');
  fire('pointerdown',290,95);fire('pointermove',290,50);fire('pointercancel',290,50);
  stage.time+=.04;stage.animateScene(.04);
  assert.equal(stage.scene.action,'gravity');assert.equal(stage.character.held,false);
  assert.equal(stage.character.falling,true);stage.reset();
  assert.equal(stage.character.falling,false);assert.equal(stage.character.features(stage.time).mouth,'curious');
});

test('motion off keeps gravity enabled without simulating a fall, while other scenes still expire', () => {
  const {stage}=pointerStage();stage.reduceMotion=true;stage.run('gravity');
  const initialY=stage.character.y;stage.time=30;stage.animateScene(.04);
  assert.equal(stage.scene?.action,'gravity');assert.equal(stage.character.y,initialY);
  assert.equal(stage.character.falling,false);
  stage.run('orbit');stage.time=41;stage.animateScene(.04);assert.equal(stage.scene,null);
});

test('fast alternating held drags produce spiral eyes, preserve gravity, then recover',()=>{
  const {stage,fire}=pointerStage();stage.reduceMotion=false;stage.run('gravity');
  fire('pointerdown',290,95);
  for(let i=0;i<8;i++){stage.time+=.045;fire('pointermove',i%2?360:220,110);}
  assert.equal(stage.character.features(stage.time).eyeStyle,'spiral');
  assert.equal(stage.character.features(stage.time).expression,'dizzy');
  assert.equal(stage.scene.action,'gravity');fire('pointerup',360,110);
  assert.equal(stage.character.features(stage.time+.2).expression,'dizzy');
  assert.equal(stage.character.features(stage.time+4).expression,'curious');
});

test('slow drags and a single fast relocation never trigger dizziness',()=>{
  const {stage,fire}=pointerStage();fire('pointerdown');
  for(let i=0;i<8;i++){stage.time+=.6;fire('pointermove',i%2?360:220,110);}
  assert.notEqual(stage.character.features(stage.time).eyeStyle,'spiral');
  fire('pointerup',360,110);stage.reset();fire('pointerdown',360,110);
  stage.time+=.03;fire('pointermove',220,110);
  assert.notEqual(stage.character.features(stage.time).eyeStyle,'spiral');
});

test('vertical shaking works, while unrelated second-pointer movement does not',()=>{
  const {stage,fire}=pointerStage();fire('pointerdown');
  for(let i=0;i<8;i++){stage.time+=.045;fire('pointermove',290,i%2?220:95,2);}
  assert.notEqual(stage.character.features(stage.time).eyeStyle,'spiral');
  for(let i=0;i<8;i++){stage.time+=.045;fire('pointermove',290,i%2?220:95);}
  assert.equal(stage.character.features(stage.time).eyeStyle,'spiral');
});

test('fine high-frequency pointer samples accumulate into a violent shake, tiny jitter does not',()=>{
  const {stage,fire}=pointerStage();fire('pointerdown');
  let x=290;
  for(let stroke=0;stroke<5;stroke++)for(let sample=0;sample<5;sample++){
    x+=stroke%2?-10:10;stage.time+=.01;fire('pointermove',x,156);
  }
  assert.equal(stage.character.features(stage.time).eyeStyle,'spiral');
  const calm=pointerStage();calm.fire('pointerdown');
  for(let i=0;i<20;i++){calm.stage.time+=.01;calm.fire('pointermove',i%2?300:290,156);}
  assert.notEqual(calm.stage.character.features(calm.stage.time).eyeStyle,'spiral');
});

test('a long hold becomes worried and a gentle release briefly looks relieved',()=>{
  const face=new Face();face.setHeld(true,1);face.update(5,.016,{x:.5,y:0},true,false);
  assert.equal(face.features(5).expression,'worried');
  face.setHeld(false,5);face.release(5,{cancelled:false,gravity:false});
  assert.equal(face.features(5.1).expression,'content');
  assert.equal(face.features(7).expression,'curious');
});

test('dizzy eyes can coexist with a closed speech mouth and reduced motion',()=>{
  const face=new Face();face.react('dizzy',1,2);face.mouthLevel=0;face.speakingUntil=Infinity;
  face.update(1.2,.016,{x:1,y:1},false,true);
  assert.equal(face.features(1.2).eyeStyle,'spiral');assert.equal(face.features(1.2).mouth,'rest');
  assert.equal(face.features(1.2).open,0);assert.equal(face.gazeX,0);
  assert.equal(face.features(1.2).bodyTilt,0);
});

test('hard landings squish with an ouch face without corrupting dialogue emotion',()=>{
  const face=new Face();face.emotion='skeptical';face.land(.9,2);
  assert.equal(face.features(2.1).expression,'ouch');assert.equal(face.features(2.1).eyeStyle,'squeezed');
  assert.ok(face.features(2.1).squash>0);
  assert.equal(face.features(4).expression,'skeptical');assert.equal(face.emotion,'skeptical');
});

test('idle yawns wake on interaction and never replace an active thought or speech',()=>{
  const face=new Face();face.update(26,.016,{x:.5,y:.46},false,false);
  assert.equal(face.features(26).expression,'yawning');
  face.noticePointer({x:.7,y:.46},26);face.update(26.1,.016,{x:.7,y:.46},false,false);
  assert.equal(face.features(26.1).expression,'curious');
  face.activity='thinking';face.update(80,.016,{x:.5,y:.46},false,false);
  assert.equal(face.features(80).expression,'thinking');
  face.activity='listening';face.update(80.1,.016,{x:.5,y:.46},false,false);
  assert.equal(face.features(80.1).expression,'listening');
});

test('fine cursor movement wakes him once the total travel crosses his attention threshold',()=>{
  const face=new Face();face.noticePointer({x:.1,y:.46},0);face.update(26,.016,{x:.1,y:.46},false,false);
  assert.equal(face.features(26).expression,'yawning');
  for(let i=1;i<=100;i++)face.noticePointer({x:.1+i*.001,y:.46},26+i*.01);
  face.update(27,.016,{x:.2,y:.46},false,false);
  assert.equal(face.features(27).expression,'curious');
});

test('explicit expression previews switch immediately and a real pickup cancels the preview',()=>{
  const face=new Face();face.preview('dizzy',1);assert.equal(face.features(1.1).expression,'dizzy');
  face.preview('happy',1.2);assert.equal(face.features(1.3).expression,'happy');
  assert.equal(face.emotion,'curious');
  face.beginDrag({x:0,y:0},1.4);face.setHeld(true,1.4);
  assert.equal(face.features(1.5).expression,'surprised');
});

test('scene personality reactions do not replace dialogue state',()=>{
  const {stage}=pointerStage();stage.character.emotion='skeptical';stage.run('orbit');
  assert.equal(stage.character.features(stage.time+.1).expression,'excited');
  assert.equal(stage.character.emotion,'skeptical');
  stage.run('takeover');assert.equal(stage.character.features(stage.time+.1).expression,'mischievous');
});
