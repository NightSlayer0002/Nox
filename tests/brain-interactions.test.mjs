import test from 'node:test';
import assert from 'node:assert/strict';
import {Orb} from '../public/js/orb.js';
const core=()=>new Orb({loadRenderer:async()=>{throw Error('No GPU needed for interaction state');}});

test('brain clicks enqueue a wave and audio pauses quiet the network drive',()=>{
  const brain=core();brain.poke(1);brain.update(1,.04,{x:.7,y:.5},false,false);
  assert.ok(brain.signal.waves?.some(w=>w.kind==='poke'));
  brain.say('A sentence with a pause.',1);brain.mouthLevel=.8;
  brain.update(1.04,.04,{x:.7,y:.5},false,false);assert.ok(brain.signal.drive>.7);
  brain.mouthLevel=0;brain.update(1.08,.04,{x:.7,y:.5},false,false);assert.equal(brain.signal.drive,0);
  brain.dispose();
});
test('drag pressure, a fast pull, release and landing all feed bounded brain activity',()=>{
  const brain=core();brain.beginDrag?.({x:10,y:10},1);brain.setHeld?.(true,1);
  brain.update(1,.04,{x:.8,y:.4},true,false);
  brain.moveDrag?.({x:200,y:10},1.04);
  brain.update(1.04,.04,{x:.8,y:.4},true,false);
  assert.ok(brain.focus.pressure>0);assert.ok(brain.signal.waves?.some(w=>w.kind==='drag'));
  brain.setHeld(false,1.08);brain.release?.(1.08,{gravity:true});brain.land?.(.8,1.12);
  brain.update(1.12,.04,{x:.8,y:.4},false,false);
  assert.ok(brain.signal.waves.some(w=>w.kind==='release'));
  assert.ok(brain.signal.waves.some(w=>w.kind==='impact'));
  assert.ok(brain.signal.waves.length<=8);
  brain.clearTouch?.();assert.equal(brain.neural.waves.length,0);assert.equal(brain.held,false);brain.dispose();
});
