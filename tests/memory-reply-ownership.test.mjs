import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHistory} from '../public/js/history.js';
import {createMemory} from '../public/js/memory.js';
import {createTurnGate} from '../public/js/turns.js';
import {normalizePacket} from '../shared/character.js';
import {spokenPreview} from '../public/js/reply.js';
import {createReplyPresentation} from '../public/js/reply-presentation.js';
const source=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
const perform=source.slice(source.indexOf('async function perform('),source.indexOf('\nfunction setBusy('));
const noop=()=>{},packet={speech:'I will remember your preference.',memory:'likes blue',action:'none',emotion:'neutral'};
const disk=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};};
async function fixture(){
 const storage=disk(),history=await createHistory(storage),memory=createMemory(storage),turns=createTurnGate(),controller=new AbortController();
 await history.append('user','Remember that I like blue');const replyTo=history.revisionTarget(1),version=turns.begin();turns.attach(version,controller);
 history.subscribe(({currentChanged})=>{if(currentChanged)turns.cancel();});
 const nodes=new Map(),context=vm.createContext({history,memory,turns,normalizePacket,spokenPreview,createReplyPresentation,setTimeout,clearTimeout,
  voice:{enabled:false,supported:true,prepare:noop,stop:noop,speak:async()=>{}},mode:'companion',lastPacket:null,pendingPresentation:null,pendingDraft:null,
  stage:{speak:noop},replyFollow:{update:fn=>fn()},addMessage:()=>({}),attachMessageActions:noop,updateMemory:noop,navigation:{render:noop},companionChanged:noop,
  replyDiagnostics:{setStatus:noop},$:id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,textContent:''});return nodes.get(id);}});
 vm.runInContext(perform,context);
 return {storage,history,memory,turns,controller,replyTo,run:()=>context.perform(packet,true,undefined,version,'balanced',true,[],{replyTo,signal:controller.signal})};
}
async function holdMemory(run){
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator'),waiting=[];
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:(name,fn)=>name==='nox.memory.write'?new Promise((resolve,reject)=>waiting.push(()=>{try{resolve(fn());}catch(e){reject(e);}})):Promise.resolve().then(fn)}}});
 try{await run(()=>{assert.equal(waiting.length,1);waiting.shift()();});}finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
}
for(const change of ['cancel','edit','delete'])test(`queued generated memory cannot outlive its reply after ${change}`,async()=>{
 // Question: can Cancel or a changed/deleted originating question still save the model's personal fact?
 // Limits: actual response/store code with controlled Web Locks; not every native tab schedule or deletion of already-committed memory.
 const f=await fixture();await holdMemory(async release=>{
  const pending=f.run();
  if(change==='cancel')f.turns.cancel();
  else{const other=await createHistory(f.storage);if(change==='edit')await other.replaceFrom(other.revisionTarget(1),'A different question');else await other.remove(other.active().id);}
  const before=f.storage.getItem('nox.chats.v1');release();await pending;
  assert.deepEqual(f.memory.snapshot().facts,[]);assert.equal(f.storage.getItem('nox.memory.v1'),null);
  assert.equal(f.storage.getItem('nox.chats.v1'),before);
 });
});
test('a current explicit memory request saves its fact and complete answer',async()=>{
 // Question: does the ownership repair retain the supported explicit remember flow?
 // Limits: consent classification and generated fact accuracy have separate tests/review.
 const f=await fixture();await f.run();assert.deepEqual(f.memory.snapshot().facts,['likes blue']);assert.equal(f.history.active().turns.at(-1).role,'assistant');
});
test('cancellation also prevents a queued name mutation',async()=>{
 // Question: can a canceled name update still write after waiting for the memory lock?
 // Limits: name mutation primitive; browser composer/request ownership is checked separately.
 const f=await fixture();await holdMemory(async release=>{const pending=f.memory.setName('Alex',{signal:f.controller.signal});f.controller.abort();release();assert.equal(await pending,false);assert.equal(f.memory.snapshot().name,'');});
});
for(const unreadable of ['invalid archive','read failure'])test(`reply effects fail closed on ${unreadable}`,async()=>{
 // Question: may cached history authorize a personal-data write when fresh transcript ownership cannot be read?
 // Limits: injected read failures and invalid bytes; not a guarantee of atomic rollback across separate browser stores.
 const f=await fixture();if(unreadable==='invalid archive')f.storage.setItem('nox.chats.v1','broken');else{const read=f.storage.getItem;f.storage.getItem=key=>{if(key==='nox.chats.v1')throw Error('blocked');return read(key);};}
 let calls=0;assert.equal(await f.history.commitReplyEffect(f.replyTo,()=>{calls++;return true;},{signal:f.controller.signal}),false);assert.equal(calls,0);
});
