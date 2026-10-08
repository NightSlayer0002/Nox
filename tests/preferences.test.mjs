import test from 'node:test';
import assert from 'node:assert/strict';
import * as preferences from '../public/js/preferences.js';
const disk=values=>({getItem:key=>values[key]??null,setItem:(key,value)=>values[key]=value});
test('NOX motion stays enabled despite legacy off settings and browser reduced motion',()=>{
  assert.equal(preferences.readMotionPreference(disk({'nox.motion.v1':'off','nox.motion.v2':'off'}),false),true);
  assert.equal(preferences.readMotionPreference(disk({'nox.motion.v2':'on'}),true),true);
  assert.equal(preferences.readMotionPreference({getItem(){throw Error('blocked');}},false),true);
});
test('dark is the new default, including old automatic light preferences and blocked storage',()=>{
  assert.equal(preferences.readTheme(disk({})),'dark');
  assert.equal(preferences.readTheme(disk({'nox.theme.v1':'light'})),'dark');
  assert.equal(preferences.readTheme({getItem(){throw Error('blocked');}}),'dark');
});
test('a deliberate new light choice survives, and unknown theme values stay dark',()=>{
  const storage=disk({});preferences.saveTheme('light',storage);
  assert.equal(preferences.readTheme(storage),'light');
  preferences.saveTheme('dark',storage);assert.equal(preferences.readTheme(storage),'dark');
  assert.equal(preferences.readTheme(disk({'nox.theme.v2':'garbage'})),'dark');
});
