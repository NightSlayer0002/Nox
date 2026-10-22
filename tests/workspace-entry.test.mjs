import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
test('initial route hides stale panels before async account and model checks finish',async()=>{
  const source=await readFile(new URL('../public/js/workspace-entry.js',import.meta.url),'utf8');
  for(const [hash,view,panel] of [['#conversation','conversation','conversation'],['#library','library','library'],['#guessing','guessing','learn'],['#afterimage','afterimage','afterimage'],['#constructor','conversation','conversation']]){
    const panels=['conversation','explore','discover','learn','library','afterimage'].map(name=>({dataset:{panel:name},hidden:false}));
    const body={dataset:{}},document=Object.assign(new EventTarget(),{body,readyState:'complete',querySelectorAll:()=>panels});
    runInNewContext(source,{document,window:new EventTarget(),location:{hash}});
    assert.equal(body.dataset.view,view);assert.deepEqual(panels.filter(node=>!node.hidden).map(node=>node.dataset.panel),[panel]);
  }
});

test('entry resolves before panels are parsed and applies the route as parsing finishes',async()=>{
  const source=await readFile(new URL('../public/js/workspace-entry.js',import.meta.url),'utf8');
  const panels=[],document=new EventTarget(),window=new EventTarget(),body={dataset:{}};
  Object.assign(document,{body,readyState:'loading',querySelectorAll:()=>panels});
  runInNewContext(source,{document,window,location:{hash:'#library'}});
  assert.equal(body.dataset.view,'library');
  panels.push(...['conversation','discover','library'].map(panel=>({dataset:{panel},hidden:panel!=='conversation'})));
  document.readyState='interactive';document.dispatchEvent(new Event('readystatechange'));
  assert.deepEqual(panels.filter(node=>!node.hidden).map(node=>node.dataset.panel),['library']);
});

test('navigation during pending module startup selects its destination immediately',async()=>{
  const source=await readFile(new URL('../public/js/workspace-entry.js',import.meta.url),'utf8');
  const panels=['conversation','discover','learn'].map(panel=>({dataset:{panel},hidden:true})),document=new EventTarget(),window=new EventTarget(),location={hash:'#conversation'};
  Object.assign(document,{body:{dataset:{}},readyState:'complete',querySelectorAll:()=>panels});
  runInNewContext(source,{document,window,location});
  location.hash='#learn';window.dispatchEvent(new Event('hashchange'));
  assert.equal(document.body.dataset.view,'learn');assert.deepEqual(panels.filter(node=>!node.hidden).map(node=>node.dataset.panel),['learn']);
});

test('the delivered shell contains only routable panels and resolves its route before workspace markup',async()=>{
  const html=await readFile(new URL('../public/app.html',import.meta.url),'utf8');
  const panels=[...html.matchAll(/data-panel="([^"]+)"/g)].map(match=>match[1]);
  for(const panel of panels)assert.ok(['conversation','discover','scenes','afterimage','library','memory','access','learn'].includes(panel),`Unroutable panel can flash during startup: ${panel}`);
  assert.ok(html.indexOf('/js/workspace-entry.js')<html.indexOf('id="workspace-nav"'),'route selection must precede visible workspace markup');
});
