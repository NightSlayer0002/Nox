import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createAdaptivePreferences} from '../public/js/adaptive-preferences.js';
const source=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
test('changing a preparing call voice releases text and pauses the call before changing engines',()=>{
  const start=source.indexOf('function changeVoiceConfiguration('),end=source.indexOf('\nfunction showVoice(',start);
  assert.ok(start>=0&&end>start,'voice settings coordinate pending text and call preparation');
  const events=[],context=vm.createContext({pendingPresentation:{reveal:reason=>events.push(reason)},voiceCall:{session:{snapshot:()=>({status:'preparing'}),fail:message=>events.push(message)}}});
  const change=vm.runInContext(`(${source.slice(start,end).trim()})`,context);
  assert.equal(change(()=>{events.push('changed');return 'browser';}),'browser');
  assert.equal(events[0],'requested');assert.match(events[1],/Voice changed/);assert.equal(events[2],'changed');
});

test('the explicit pace control commits a general preference without dispatching a proposal',async()=>{
  const data=new Map(),preferences=createAdaptivePreferences({getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)});
  await preferences.approve(preferences.propose('Speak at 0.75x','learning'));
  const nodes={'speech-pace':{value:'0.85',addEventListener(_type,handler){this.change=handler;}},'speech-pace-note':{textContent:''}};
  const start=source.indexOf("$('speech-pace')?.addEventListener"),end=source.indexOf("$('stop-voice')",start);
  let proposals=0;
  vm.runInNewContext(source.slice(start,end),{$:id=>nodes[id],approvedPreferences:preferences,voice:{setPace(){}},companionBridge:{propose(){proposals++;},preferenceChanged(){}},applyApprovedPreferences(){},visit:{owner:false}});
  await nodes['speech-pace'].change({target:nodes['speech-pace'],currentTarget:nodes['speech-pace']});
  assert.equal(preferences.context().speechPace,.85);assert.equal(preferences.list().find(entry=>entry.scope==='general')?.value,.85);assert.equal(proposals,0);
  assert.equal(preferences.context('learning').speechPace,.75);
});

test('voice settings hide only the inactive engine speaker without clearing either selection',()=>{
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,value:id==='speaker-select'?'daniel':id==='browser-speaker'?'Saved browser voice':'',setAttribute(){},querySelector(){return {textContent:''};}});return nodes.get(id);};
  const voice={enabled:false,engine:'browser'},start=source.indexOf('function showVoice('),end=source.indexOf('\nfunction showConnection(',start);
  const show=vm.runInNewContext(`(${source.slice(start,end).trim()})`,{$:node,voice,afterimageBridge:{refreshState(){}}});
  show();assert.equal(node('natural-speaker-row').hidden,true);assert.equal(node('browser-speaker-row').hidden,false);
  voice.engine='natural';show();assert.equal(node('natural-speaker-row').hidden,false);assert.equal(node('browser-speaker-row').hidden,true);
  assert.equal(node('speaker-select').value,'daniel');assert.equal(node('browser-speaker').value,'Saved browser voice');
});

test('the default pace control stays independent of an activity override while voice keeps that override',async()=>{
  const data=new Map(),preferences=createAdaptivePreferences({getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)});
  await preferences.approve(preferences.propose('Speak at 0.85x','general'));
  await preferences.approve(preferences.propose('Speak at 0.75x','learning'));
  const select={value:'1',options:[{value:'0.75'},{value:'0.85'},{value:'1.15'}]},voice={pace:1,setPace(value){this.pace=value;}};
  const start=source.indexOf('function applyApprovedPreferences('),end=source.indexOf('\nlet preferredEngine',start);
  const apply=vm.runInNewContext(`(${source.slice(start,end).trim()})`,{$:()=>select,approvedPreferences:preferences,currentActivity:'explore',voice});
  apply();assert.equal(select.value,'0.85');assert.equal(voice.pace,.75);
  await preferences.approve(preferences.propose('Speak at 1.15x','general'));
  apply();assert.equal(select.value,'1.15');assert.equal(voice.pace,.75);
});
