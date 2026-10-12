import test from 'node:test';
import assert from 'node:assert/strict';
const module=await import('../public/js/brain-lifecycle.js').catch(()=>null);
test('lost context blocks draw, restoration requests replacement and disposal removes listeners',()=>{
  assert.ok(module,'brain resource lifecycle must exist');
  const canvas=new EventTarget();let draws=0,cleanups=0,restores=0;
  const renderer=module.createBrainLifecycle({canvas,draw(){draws++;return true;},disposeResources(){cleanups++;}});
  renderer.onRestore=()=>{restores++;};assert.equal(renderer.render({},{}),true);
  const lost=new Event('webglcontextlost',{cancelable:true});canvas.dispatchEvent(lost);assert.equal(lost.defaultPrevented,true);
  assert.equal(renderer.render({},{}),false);assert.equal(draws,1);
  canvas.dispatchEvent(new Event('webglcontextrestored'));assert.equal(restores,1);
  renderer.dispose();renderer.dispose();canvas.dispatchEvent(new Event('webglcontextrestored'));
  assert.equal(restores,1);assert.equal(cleanups,1);assert.equal(renderer.render({},{}),false);
});
