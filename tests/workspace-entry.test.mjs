import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
test('initial route hides stale panels before async account and model checks finish',async()=>{
  const source=await readFile(new URL('../public/js/workspace-entry.js',import.meta.url),'utf8');
  for(const [hash,view,panel] of [['#conversation','conversation','conversation'],['#library','library','library'],['#guessing','guessing','learn'],['#afterimage','afterimage','afterimage'],['#constructor','conversation','conversation']]){
    const panels=['conversation','explore','discover','learn','library','afterimage'].map(name=>({dataset:{panel:name},hidden:false}));
    const body={dataset:{}},document={body,querySelectorAll:()=>panels};
    runInNewContext(source,{document,location:{hash}});
    assert.equal(body.dataset.view,view);assert.deepEqual(panels.filter(node=>!node.hidden).map(node=>node.dataset.panel),[panel]);
  }
});
