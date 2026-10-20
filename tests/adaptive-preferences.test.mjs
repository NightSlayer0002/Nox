import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdaptivePreferences } from '../public/js/adaptive-preferences.js';
const storage=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};};

test('corrupt and newer preference bytes survive approve, update, clear and import unchanged',async()=>{
  const source=createAdaptivePreferences(storage());const item=await source.approve(source.propose('Keep answers short')),incoming=source.export();
  for(const raw of ['{broken',JSON.stringify({version:2,preferences:[{id:'future-preference'}]})]){
    const disk=storage();disk.setItem('nox.approved-preferences.v1',raw);const preferences=createAdaptivePreferences(disk),proposal=preferences.propose('Speak slower');
    assert.equal(await preferences.approve(proposal),null);assert.equal(await preferences.update(item.id,'detailed'),null);
    assert.equal(await preferences.remove(item.id),false);assert.equal(await preferences.clear(),false);assert.equal((await preferences.import(incoming)).ok,false);
    assert.equal(disk.getItem('nox.approved-preferences.v1'),raw);assert.equal(preferences.export(),raw);assert.equal(preferences.status.error,'unreadable-storage');
    disk.setItem('nox.approved-preferences.v1',incoming);
    assert.ok(await preferences.approve(proposal));assert.equal(preferences.list().length,2);
  }
});

test('two preference tabs serialize approval, import, edits and forgetting without resurrection',async()=>{
  const disk=storage(),a=createAdaptivePreferences(disk),b=createAdaptivePreferences({...disk}),source=createAdaptivePreferences(storage());
  const length=await a.approve(a.propose('Keep answers short'));await source.approve(source.propose('Make stories gentle'));const incoming=source.export();
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator'),queue=[],locks={request(name,action){return new Promise((resolve,reject)=>queue.push({name,action,resolve,reject}));}};
  const drain=async()=>{while(queue.length){const next=queue.shift();try{next.resolve(await next.action());}catch(error){next.reject(error);}}};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks}});
  try{
    assert.equal(a.crossTabSafe,true);assert.equal(a.status.crossTabSafe,true);
    const pace=a.approve(a.propose('Speak slower')),clue=b.approve(b.propose('Let me try first'));
    assert.equal(queue.length,2);await drain();assert.ok(await pace);assert.ok(await clue);assert.equal(a.list().length,3);
    const forget=a.remove(length.id),imported=b.import(incoming),unrelated=b.update((await pace).id,1.15);
    await drain();assert.equal(await forget,true);assert.equal((await imported).imported,1);assert.equal((await unrelated).value,1.15);
    assert.equal(a.context().answerLength,undefined);assert.equal(a.context().speechPace,1.15);assert.equal(a.context('story').storyIntensity,'gentle');
    const gone=a.remove((await pace).id),staleEdit=b.update((await pace).id,.9);
    await drain();assert.equal(await gone,true);assert.equal(await staleEdit,null);assert.equal(a.context().speechPace,undefined);
    const proposal=a.propose('Keep answers short'),one=a.approve(proposal),twice=a.approve(proposal);
    await drain();assert.ok(await one);assert.equal(await twice,null);
  }finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
});

test('a supported natural instruction proposes but never remembers without approval',async()=>{
  const disk=storage(),preferences=createAdaptivePreferences(disk),proposal=preferences.propose('Let me try first');
  assert.equal(proposal.key,'learningStyle');assert.equal(proposal.value,'hints');assert.equal(proposal.scope,'learning');
  assert.equal(createAdaptivePreferences(disk).list().length,0);
  const approved=(await preferences.approve(proposal));assert.equal(approved.origin,'Let me try first');assert.ok(approved.confirmedAt);
  const restored=createAdaptivePreferences(disk);
  assert.deepEqual(restored.context('learning'),{learningStyle:'hints'});assert.deepEqual(restored.context('general'),{});
  assert.equal((await preferences.approve(proposal)),null);
});

test('all bounded preferences are editable, scoped, and forgetting removes later influence',async()=>{
  const disk=storage(),preferences=createAdaptivePreferences(disk);
  for(const [text,key,value,scope] of [
    ['Please give shorter answers','answerLength','short','general'],['Speak a little slower','speechPace',.85,'general'],
    ['Explain first when we learn','learningStyle','explain','learning'],['Make stories more mysterious','storyIntensity','mysterious','story'],
    ['Use 12 questions in the guessing game','gameQuestionLimit',12,'guessing'],['Turn hints off in the guessing game','gameHints',false,'guessing'],
  ]){const proposal=preferences.propose(text);assert.equal(proposal?.key,key,text);assert.equal(proposal.value,value);assert.equal(proposal.scope,scope);assert.ok((await preferences.approve(proposal)));}
  assert.deepEqual(preferences.context('explore'),{answerLength:'short',speechPace:.85,learningStyle:'explain'});
  assert.deepEqual(preferences.context('guessing'),{answerLength:'short',speechPace:.85,gameQuestionLimit:12,gameHints:false});
  const length=preferences.list().find(p=>p.key==='answerLength');
  assert.equal((await preferences.update(length.id,'detailed')).value,'detailed');assert.equal((await preferences.update(length.id,'unlimited')),null);
  assert.equal((await preferences.remove(length.id)),true);assert.equal(createAdaptivePreferences(disk).context().answerLength,undefined);
  assert.equal((await preferences.clear()),true);assert.deepEqual(createAdaptivePreferences(disk).context('learning'),{});
});

test('negated, hypothetical, unsupported and ambiguous instructions do not become proposals',async()=>{
  const preferences=createAdaptivePreferences(storage());
  for(const text of ['Do not remember that I like shorter answers','I do not want shorter answers','I want answers not short','Maybe speak slower someday?','He said "let me try first"','I love cats','Use 200 questions in the guessing game','Use 2 questions in the guessing game','Always know my location','Make answers shorter and speak slower'])assert.equal(preferences.propose(text),null,text);
  const proposal=preferences.propose('Keep answers short');
  assert.equal((await preferences.approve({...proposal,value:'detailed'})),null);assert.equal(preferences.list().length,0);
  assert.ok((await preferences.approve(proposal)));
});

test('a direct preference instruction supports numeric pace and the launch clue wording',async()=>{
  const preferences=createAdaptivePreferences(storage());
  for(const [text,key,value] of [['One clue at a time','learningStyle','hints'],['Speak at 0.8x','speechPace',.8],['Please answer briefly','answerLength','short'],['Remember that I prefer detailed answers','answerLength','detailed'],['Limit the guessing game to 10 questions','gameQuestionLimit',10]]){
    const proposal=preferences.propose(text);assert.equal(proposal?.key,key,text);assert.equal(proposal.value,value);
  }
  assert.equal(preferences.propose('Speak at 2x'),null);
  assert.equal(preferences.propose('Let me try first','__proto__'),null);
});

test('preference imports preserve consent metadata, merge safely and reject tampering atomically',async()=>{
  const preferences=createAdaptivePreferences(storage()),other=createAdaptivePreferences(storage());
  (await preferences.approve(preferences.propose('Keep answers short')));(await other.approve(other.propose('Speak faster')));
  assert.deepEqual((await other.import(preferences.export())),{ok:true,imported:1});assert.equal(other.list().length,2);
  const before=other.export(),data=JSON.parse(preferences.export());
  data.preferences[0].scope='learning';data.preferences[0].key='gameHints';data.preferences[0].value=true;
  assert.equal((await other.import(JSON.stringify(data))).ok,false);assert.equal(other.export(),before);
  assert.equal((await other.import('{"version":1,"preferences":[{"__proto__":{}}]}')).ok,false);
  const duplicate=JSON.parse(preferences.export());duplicate.preferences.push({...duplicate.preferences[0],id:'different'});
  assert.equal((await other.import(JSON.stringify(duplicate))).ok,false);assert.equal(other.export(),before);
});

test('unavailable storage never reports an approval as durable or destroys existing choices',async()=>{
  const disk=storage(),preferences=createAdaptivePreferences(disk);(await preferences.approve(preferences.propose('Keep answers short')));
  disk.setItem=()=>{throw Error('full');};
  assert.equal((await preferences.approve(preferences.propose('Speak slower'))),null);assert.equal(preferences.persistent,false);
  assert.deepEqual(preferences.context(),{answerLength:'short'});
  const fresh=createAdaptivePreferences({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});
  assert.deepEqual(fresh.context(),{});assert.equal(fresh.persistent,false);
});
