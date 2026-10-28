import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
const registration=source.match(/document\.addEventListener\('keydown', event => \{[\s\S]*?\n\}\);/)?.[0];
assert.ok(registration,'the scene Escape listener must remain available');
function scene(){
  let keydown;const changes={film:0,record:0,reset:0};
  vm.runInNewContext(registration,{document:{addEventListener:(_type,handler)=>{keydown=handler;},querySelector:()=>null,body:{classList:{contains:()=>false}}},$:()=>({open:false}),recorder:{active:false},toggleFilm:()=>changes.film++,toggleRecording:()=>changes.record++,resetScene:()=>changes.reset++});
  return {changes,key:key=>keydown({key,target:{tagName:'BUTTON',isContentEditable:false}})};
}
for(const key of ['f','F','r','R'])test(`unmodified ${key} on an unrelated control does not change film or capture`,()=>{
  // Resolves the real registered handler's side effects for this key. Synthetic
  // events do not establish native focus order, AT interaction or recorder quality.
  const ui=scene();ui.key(key);assert.deepEqual(ui.changes,{film:0,record:0,reset:0});
});
test('Escape still resets the scene after single-letter shortcuts are removed',()=>{
  // Resolves the retained escape path, not every dialog/edit/IME interception.
  const ui=scene();ui.key('Escape');assert.equal(ui.changes.reset,1);
});
test('visible studio controls remain available without advertising removed shortcuts',async()=>{
  // Static markup establishes native buttons/copy, not their complete browser behavior.
  const html=await readFile(new URL('../public/app.html',import.meta.url),'utf8');
  assert.match(html,/<button[^>]*id="film-button"/);assert.match(html,/<button[^>]*id="record-button"/);
  assert.equal(/\(F\)|\(R\)|Press F to toggle/.test(html),false,'removed shortcuts must not be advertised');
});
