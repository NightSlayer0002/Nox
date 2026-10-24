import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistory} from '../public/js/history.js';
import {messageSources,attachMessageSources} from '../public/js/message-sources.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};

test('source labels survive reopening and export without copying notebook contents into context',async()=>{
  const disk=storage(),history=await createHistory(disk);
  await history.append('user','What color was the fictional door?');
  await history.append('assistant','Blue.',{sources:[{id:'note-1',title:'Fictional house',text:'PRIVATE NOTE BODY',extra:'not metadata'}]});
  const turn=(await createHistory(disk)).active().turns.at(-1);
  assert.deepEqual(turn.sources,[{id:'note-1',title:'Fictional house'}]);
  assert.deepEqual(JSON.parse(history.export()).threads[0].turns.at(-1).sources,turn.sources);
  assert.doesNotMatch(history.export(),/PRIVATE NOTE BODY|not metadata/);
  assert.deepEqual(history.context().history.at(-1),{role:'assistant',content:'Blue.'});
});

test('source metadata is bounded, deduplicated, optional and assistant-only',async()=>{
  const history=await createHistory(storage()),sources=Array.from({length:20},(_,i)=>({id:`n${i}`,title:'T'.repeat(300)}));
  await history.append('user','Question',{sources});assert.equal(history.active().turns[0].sources,undefined);
  await history.append('assistant','Answer',{sources});const saved=history.active().turns[1].sources;
  assert.equal(saved.length,6);assert.equal(saved[0].title.length,120);
  assert.deepEqual(messageSources([null,{id:'n',title:'A\nB'},{id:'n',title:'duplicate'},{id:'',title:'invalid'}]),[{id:'n',title:'A B'}]);
  await history.append('assistant','Legacy answer');assert.equal(history.active().turns.at(-1).sources,undefined);
});

test('attribution uses text nodes even for markup-looking titles',()=>{
  let label;const doc={createElement:()=>label={}},message={append:v=>assert.equal(v,label)};
  attachMessageSources(message,[{id:'n',title:'<img src=x onerror=alert(1)>'}],doc);
  assert.equal(label.textContent,'Context included: [n] <img src=x onerror=alert(1)>');
  assert.equal(label.innerHTML,undefined);
});
