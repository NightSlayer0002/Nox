import test from 'node:test';
import assert from 'node:assert/strict';
import {orbitPose,createOrbitEffect} from '../public/js/orbit-effect.js';

test('orbit follows the character and scales with his body rather than viewport width',()=>{
  const face={x:.3,y:.4,diameter:()=>180};
  const small=orbitPose(face,600,500),wide=orbitPose(face,1000,500);
  assert.equal(small.size,wide.size);assert.equal(small.x,180);assert.equal(wide.x,300);
  assert.equal(small.y,200);assert.ok(small.size>180&&small.size<360);
  face.diameter=()=>90;assert.equal(orbitPose(face,600,500).size,small.size/2);
});
test('orbit stays bounded in portrait and wide stages',()=>{
  const face={x:.5,y:.46,diameter:()=>1000};
  for(const [w,h] of [[320,600],[1200,300]]){const pose=orbitPose(face,w,h);assert.ok(pose.size<=w*.92);assert.ok(pose.size<=h*.85);}
});
test('source artwork is loaded once, draws into the captured canvas, and stops after disposal',async()=>{
  let loads=0;const image={};const effect=createOrbitEffect({loadImage:async()=>{loads++;return image;}});
  await effect.ready;
  const drawn=[],ctx=new Proxy({drawImage:asset=>drawn.push(asset)}, {get:(target,key)=>target[key]||(()=>{})});
  const face={x:.5,y:.46,diameter:()=>120};
  assert.equal(effect.draw(ctx,face,500,500,1,false,'back'),true);
  assert.equal(effect.draw(ctx,face,500,500,1,false,'front'),true);
  assert.equal(loads,1);assert.equal(drawn.length,4);assert.ok(drawn.every(asset=>asset===image));
  effect.dispose();assert.equal(effect.draw(ctx,face,500,500,2,false,'front'),false);
});
test('unavailable source artwork fails quietly without substituting generated particles',async()=>{
  const effect=createOrbitEffect({loadImage:async()=>{throw Error('unavailable');}});await effect.ready;
  assert.equal(effect.draw({}, {},500,500,0,false,'back'),false);effect.dispose();
});
