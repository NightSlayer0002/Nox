import test from 'node:test';
import assert from 'node:assert/strict';
import { readMotionPreference, readMotionChoice } from '../public/js/preferences.js';
test('motion defaults on but explicit current or previous off choices survive',()=>{
  const storage=values=>({getItem:key=>values[key]??null});
  assert.equal(readMotionPreference(storage({})),true);
  assert.equal(readMotionPreference(storage({'nox.motion.v1':'off'})),false);
  assert.equal(readMotionPreference(storage({'nox.motion.v2':'off'})),false);
  assert.equal(readMotionPreference(storage({'nox.motion.v2':'on','nox.motion.v1':'off'})),true);
  assert.equal(readMotionPreference({getItem(){throw Error('blocked');}}),true);
});
test('an unset motion preference is distinguishable from a saved override',()=>{
  assert.equal(readMotionChoice({getItem(){return null;}}),null);
  assert.equal(readMotionChoice({getItem(){return 'on';}}),true);
  assert.equal(readMotionChoice({getItem(){return 'off';}}),false);
});
test('first visit respects OS reduced motion while a deliberate choice wins',()=>{
  const disk={getItem(){return null;}};
  assert.equal(readMotionPreference(disk,true),false);
  assert.equal(readMotionPreference({getItem(){return 'on';}},true),true);
  assert.equal(readMotionPreference({getItem(){throw Error('blocked');}},true),false);
});
