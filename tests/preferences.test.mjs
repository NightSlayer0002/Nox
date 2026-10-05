import test from 'node:test';
import assert from 'node:assert/strict';
import { readMotionPreference } from '../public/js/preferences.js';
test('motion defaults on but explicit current or previous off choices survive',()=>{
  const storage=values=>({getItem:key=>values[key]??null});
  assert.equal(readMotionPreference(storage({})),true);
  assert.equal(readMotionPreference(storage({'nox.motion.v1':'off'})),false);
  assert.equal(readMotionPreference(storage({'nox.motion.v2':'off'})),false);
  assert.equal(readMotionPreference(storage({'nox.motion.v2':'on','nox.motion.v1':'off'})),true);
  assert.equal(readMotionPreference({getItem(){throw Error('blocked');}}),true);
});
