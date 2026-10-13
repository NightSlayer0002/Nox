import test from 'node:test';
import assert from 'node:assert/strict';
const module=await import('../public/js/brain-quality.js').catch(()=>null);
const quality=options=>{assert.ok(module,'adaptive brain quality must exist');return module.brainQuality(options);};
test('phone and low-memory devices use smaller capture buffers and bounded neural budgets',()=>{
  for(const q of [quality({width:390}),quality({width:1366,memory:2})]){
    assert.equal(q.size,384);assert.equal(q.nodes,2000);assert.equal(q.edges,5000);assert.equal(q.interval,1/24);
  }
  assert.deepEqual(quality({width:1366,memory:8}),{size:512,nodes:4200,edges:11000,interval:1/30});
});
test('missing or malformed device hints have safe finite quality defaults',()=>{
  for(const options of [{},{width:NaN,memory:Infinity},{width:-1,memory:-1}]){
    const q=quality(options);assert.ok(q.size<=512&&q.nodes<=4200&&q.edges<=11000);assert.ok(Number.isFinite(q.interval)&&q.interval>=1/30);
  }
});
