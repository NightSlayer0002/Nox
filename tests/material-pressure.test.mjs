import test from 'node:test';
import assert from 'node:assert/strict';
import {logoPressure,glassPressure} from '../public/js/source-effects.js';
test('pressure changes the original shader parameters and releasing restores the original preset',()=>{
  const rest=logoPressure(0),held=logoPressure(1);
  assert.ok(held.speed>rest.speed);assert.ok(held.scale<rest.scale);
  assert.deepEqual(logoPressure(0),rest);
  assert.ok(glassPressure(1,1).warp>glassPressure(0,0).warp);
});
test('invalid and extreme pressure cannot send NaN or unbounded values to a shader',()=>{
  for(const value of [NaN,Infinity,-100,100,undefined])for(const parameters of [logoPressure(value),glassPressure(value,value)])for(const number of Object.values(parameters))assert.ok(Number.isFinite(number)&&Math.abs(number)<30);
  assert.deepEqual(logoPressure(-100),logoPressure(0));assert.deepEqual(logoPressure(100),logoPressure(1));
});
