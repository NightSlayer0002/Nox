import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from '../public/js/stage.js';
test('the recording canvas composites the public source gradient before NOX',()=>{
  const draws=[],stage=Object.create(Stage.prototype),source={width:800,height:600};
  stage.setBackgroundSource(source);stage.drawBackground({drawImage:(...args)=>draws.push(args),fillRect(){throw Error('should use source');}},400,300);
  assert.deepEqual(draws,[[source,0,0,400,300]]);
});
test('unavailable background textures use a plain local surface',()=>{
  const fills=[],stage=Object.create(Stage.prototype),ctx={fillRect:(...args)=>fills.push(args)};
  stage.setBackgroundSource({width:0,height:0});stage.drawBackground(ctx,400,300);
  assert.equal(ctx.fillStyle,'#080e11');assert.deepEqual(fills,[[0,0,400,300]]);
});
