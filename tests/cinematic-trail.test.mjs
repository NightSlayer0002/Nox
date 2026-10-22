import test from 'node:test';
import assert from 'node:assert/strict';
import {cinematicTrailWidth} from '../public/js/cinematic-trail.js';

// MeshLine offsets its clip-space strip before dividing by the canvas aspect.
// Project that offset into CSS pixels, including a diagonal/turning normal.
function projectedWidth(lineWidth,width,height,angle){
  const aspect=width/height;
  return Math.hypot(Math.cos(angle)*lineWidth*width/(2*aspect),Math.sin(angle)*lineWidth*height/(2*aspect));
}

for(const [width,height] of [[288,470],[344,557],[396,610],[776,470]]){
  test(`mobile flight trails stay within 14 CSS pixels in a ${width} × ${height} room`,()=>{
    const lineWidth=cinematicTrailWidth(width,height,{compact:true});
    for(let angle=0;angle<Math.PI*2;angle+=Math.PI/32){
      const pixels=projectedWidth(lineWidth,width,height,angle);
      assert.ok(pixels<=14.00001,`a turn projects to ${pixels.toFixed(1)}px instead of a narrow trail`);
    }
    assert.ok(projectedWidth(lineWidth,width,height,Math.PI/2)>=5,'keep a visible trail');
  });
}

test('desktop keeps the established ribbon width',()=>{
  assert.equal(cinematicTrailWidth(1600,720),.5);
});

test('a hidden or unmeasured room cannot produce an invalid trail width',()=>{
  for(const [width,height] of [[0,470],[344,0],[NaN,470],[344,Infinity]]){
    assert.equal(cinematicTrailWidth(width,height,{compact:true}),0);
  }
});
