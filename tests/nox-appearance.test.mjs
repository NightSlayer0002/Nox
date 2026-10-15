import test from 'node:test';
import assert from 'node:assert/strict';
import {appearancePose,appearanceProfile} from '../client/nox-appearance.js';

test('normal NOX has a diffuse body independent of the optional Chrome surface',()=>{
  const normal=appearanceProfile('face'),metal=appearanceProfile('liquid');
  assert.equal(normal.chrome,false);
  assert.ok(normal.material.roughness>.6);
  assert.ok(normal.material.metalness<.1);
  assert.equal(metal.chrome,true);
  assert.ok(metal.material.metalness>.9);
});

test('a held normal body stretches with its face but remains inside the frame budget',()=>{
  const pose=appearancePose('face',{Hold:.65,WobbleLeft:0,WobbleRight:0,Impact:0});
  assert.ok(pose.scale[1]>1.08&&pose.scale[1]<=1.1);
  assert.ok(pose.scale[0]<1&&pose.scale[0]>=.95);
  assert.equal(pose.scale[2],1);
  const extreme=appearancePose('face',{Hold:100,WobbleRight:100});
  assert.ok(extreme.scale[1]<=1.1&&extreme.scale[0]>=.95);
});

test('normal release sway follows the pull direction and settles back to a neutral group',()=>{
  const right=appearancePose('face',{WobbleRight:.5}),left=appearancePose('face',{WobbleLeft:.5});
  assert.ok(right.rotation<0&&left.rotation>0);
  assert.equal(right.rotation,-left.rotation);
  assert.ok(right.morphs.WobbleRight>.5,'the softer normal body responds more than metal');
  assert.deepEqual(appearancePose('face',{}).scale,[1,1,1]);
  assert.equal(appearancePose('face',{}).rotation,0);
});

test('impact stays local and reduced motion removes group deformation',()=>{
  assert.deepEqual(appearancePose('face',{Impact:1}).scale,[1,1,1]);
  const still=appearancePose('face',{Hold:.65,WobbleRight:1,Impact:1},true);
  assert.deepEqual(still.scale,[1,1,1]);
  assert.equal(still.rotation,0);
  assert.deepEqual(still.morphs,{Hold:0,WobbleLeft:0,WobbleRight:0,Impact:0});
});

test('legacy liquid rendering retains its deformation and invalid weights remain finite',()=>{
  const weights={Hold:.4,WobbleLeft:0,WobbleRight:.3,Impact:.2};
  assert.deepEqual(appearancePose('liquid',weights).morphs,weights);
  assert.deepEqual(appearancePose('liquid',weights).scale,[1,1,1]);
  for(const value of Object.values(appearancePose('face',{Hold:NaN,WobbleRight:Infinity}).morphs))assert.ok(Number.isFinite(value));
  assert.equal(appearanceProfile().chrome,true);
});
