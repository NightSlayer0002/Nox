import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
test('changing a preparing call voice releases text and pauses the call before changing engines',()=>{
  const start=source.indexOf('function changeVoiceConfiguration('),end=source.indexOf('\nfunction showVoice(',start);
  assert.ok(start>=0&&end>start,'voice settings coordinate pending text and call preparation');
  const events=[],context=vm.createContext({pendingPresentation:{reveal:reason=>events.push(reason)},voiceCall:{session:{snapshot:()=>({status:'preparing'}),fail:message=>events.push(message)}}});
  const change=vm.runInContext(`(${source.slice(start,end).trim()})`,context);
  assert.equal(change(()=>{events.push('changed');return 'browser';}),'browser');
  assert.equal(events[0],'requested');assert.match(events[1],/Voice changed/);assert.equal(events[2],'changed');
});
