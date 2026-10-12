import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const module=await import('../public/js/brain-data.js').catch(()=>null);
test('brain loader rejects truncated and oversized geometry before creating GPU buffers',()=>{
  assert.ok(module,'source geometry decoder must exist');
  assert.throws(()=>module.decodeBrain(new ArrayBuffer(5)),/brain/i);
  const bad=new ArrayBuffer(12),view=new DataView(bad);view.setUint32(0,0x4e4f5842,true);view.setUint32(4,999999999,true);view.setUint32(8,1,true);
  assert.throws(()=>module.decodeBrain(bad),/brain/i);
});
test('source brain contains hemispheres and folds within finite anatomical bounds',async()=>{
  assert.ok(module,'source geometry decoder must exist');
  const bytes=await readFile(new URL('../public/vendor/bodyparts3d/brain.bin',import.meta.url));
  const brain=module.decodeBrain(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  assert.ok(brain.positions.length>3000);assert.ok(brain.indices.length>3000);assert.ok(brain.positions.every(Number.isFinite));
  const bounds=[0,1,2].map(axis=>{const values=Array.from(brain.positions).filter((_,i)=>i%3===axis);return [Math.min(...values),Math.max(...values)];});
  for(const [low,high] of bounds){assert.ok(high-low>50);assert.ok(high-low<250);}
  assert.ok(brain.indices.every(index=>index<brain.positions.length/3));
});
