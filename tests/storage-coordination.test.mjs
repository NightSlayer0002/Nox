import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistory} from '../public/js/history.js';
import {createMemory} from '../public/js/memory.js';
import {createAdaptivePreferences} from '../public/js/adaptive-preferences.js';

const HISTORY='nox.chats.v1',MEMORY='nox.memory.v1',PREFERENCES='nox.approved-preferences.v1';
const preference={id:'approved-length',key:'answerLength',value:'short',scope:'general',origin:'Keep answers short',confirmedAt:1,updatedAt:1};
const memory={version:1,name:'Private name',facts:['A private fact'],history:[{role:'user',content:'A legacy message'}],mode:'companion'};
const archive={version:1,active:'alpha',threads:[{id:'alpha',mode:'companion',turns:Array.from({length:20},(_,i)=>({seq:i+1,role:i%2?'assistant':'user',content:`Saved turn ${i+1}`}))},{id:'beta',mode:'director',turns:[{seq:1,role:'user',content:'Another saved conversation'}]}]};
function disk(temporary=false){const values=new Map();return {temporary,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}
function browser(t,locks){
  const previous=['window','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
  Object.defineProperty(globalThis,'window',{configurable:true,value:new EventTarget()});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:locks?{locks}:{}});
  t.after(()=>{for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
}
const seeded=(storage,key,value)=>{const raw=JSON.stringify(value,null,1)+'\n';storage.setItem(key,raw);return raw;};

// C03: catches an unlocked history mutation or eager startup migration. This
// injected capability boundary proves byte preservation, not browser scheduling.
test('a browser without origin locks keeps history readable and every durable mutation preserves the original bytes',async t=>{
  browser(t);const storage=disk(),raw=seeded(storage,HISTORY,archive),a=await createHistory(storage),b=await createHistory({...storage});
  assert.equal(storage.getItem(HISTORY),raw);assert.equal(a.active().turns[0].content,'Saved turn 1');assert.equal(JSON.parse(a.export()).threads.length,2);
  const edit=b.revisionTarget(1),retry=b.revisionTarget(2,{role:'assistant'}),work=b.summaryWork();
  for(const [operation,want] of [[()=>a.remove('alpha'),false],[()=>b.replaceFrom(edit,'A stale edit'),null],[()=>b.retryFrom(retry),null],[()=>a.append('user','An unlocked append'),false],[()=>b.create(),null],[()=>b.setMode('uncanny'),false],[()=>a.applySummary(work,'An unlocked summary'),false]]){
    assert.equal(await operation(),want);assert.equal(storage.getItem(HISTORY),raw);
  }
  assert.equal(await a.select('beta'),true);assert.equal(a.active().id,'beta');assert.equal(await a.setMode('director'),true,'restoring the existing mode is a read-only no-op');assert.equal(storage.getItem(HISTORY),raw);
  for(const history of [a,b]){assert.equal(history.persistent,false);assert.equal(history.crossTabSafe,false);assert.equal(history.lastError,'coordination-unavailable');history.dispose();}
});

// C03: catches throwing startup or unlocked recovery writes. Corrupt/future
// fixtures cover original-byte protection; this is not an app rendering test.
test('unsupported history startup and recovery settle normally without initializing or replacing durable bytes',async t=>{
  browser(t);
  for(const raw of [null,'{broken','{"version":2,"private":"future archive"}']){
    const storage=disk();if(raw!==null)storage.setItem(HISTORY,raw);
    const history=await createHistory(storage);assert.ok(history.active());assert.equal(await history.setMode(history.active().mode),true);
    assert.equal(await history.resetArchive(),false);assert.equal(storage.getItem(HISTORY),raw);
    if(raw!==null)assert.equal(history.exportOriginal(),raw);history.dispose();
  }
});

// C03: catches memory's synchronous browser fallback, including unrelated mode
// updates after another instance tries to forget data. No timing frequency is inferred.
test('unsupported browser memory refuses both instances clear and edit operations without changing private bytes',async t=>{
  browser(t);const storage=disk(),raw=seeded(storage,MEMORY,memory),a=createMemory(storage),b=createMemory({...storage});
  for(const operation of [()=>a.clear(),()=>b.setMode('director'),()=>a.setName('New name'),()=>b.remember('New fact'),()=>a.addTurn('assistant','New turn'),()=>b.clearHistory()]){
    assert.equal(await operation(),false);assert.equal(storage.getItem(MEMORY),raw);
  }
  for(const store of [a,b]){assert.deepEqual(store.snapshot(),memory);assert.equal(store.persistent,false);assert.equal(store.crossTabSafe,false);assert.equal(store.status.error,'coordination-unavailable');store.dispose();}
});

// C03: catches approval/import bypassing the durable-write capability gate. The
// fixture retains approval provenance; this does not assert preference UI copy.
test('unsupported browser preferences remain readable while clear update approval and import leave both instances bytes unchanged',async t=>{
  browser(t);const storage=disk(),raw=seeded(storage,PREFERENCES,{version:1,preferences:[preference]}),a=createAdaptivePreferences(storage),b=createAdaptivePreferences({...storage});
  for(const [operation,want] of [[()=>a.remove(preference.id),false],[()=>b.update(preference.id,'detailed'),null],[()=>a.clear(),false],[()=>b.approve(b.propose('Speak slower')),null]]){
    assert.equal(await operation(),want);assert.equal(storage.getItem(PREFERENCES),raw);
  }
  assert.deepEqual(await b.import(raw),{ok:false,imported:0,error:'coordination-unavailable'});assert.equal(storage.getItem(PREFERENCES),raw);
  for(const store of [a,b]){assert.deepEqual(store.context(),{answerLength:'short'});assert.deepEqual(JSON.parse(store.export()).preferences,[preference]);assert.equal(store.persistent,false);assert.equal(store.crossTabSafe,false);assert.equal(store.status.error,'coordination-unavailable');}
});

// C03: catches accidentally applying the owner gate to isolated guest stores.
// A shared injected visit store exercises normal mutations, not cross-tab durability.
test('temporary browser storage keeps normal history memory and preference mutations without origin locks',async t=>{
  browser(t);const storage=disk(true),history=await createHistory(storage),notebook=createMemory(storage),preferences=createAdaptivePreferences(storage);
  await history.append('user','Guest question');await history.append('assistant','Guest answer');assert.ok(await history.replaceFrom(history.revisionTarget(1),'Guest correction'));assert.equal(await history.remove(history.active().id),true);
  assert.equal(await notebook.setName('Guest name'),true);assert.equal(await notebook.remember('Guest fact'),true);assert.equal(await notebook.clear(),true);
  const approved=await preferences.approve(preferences.propose('Keep answers short'));assert.ok(approved);assert.equal((await preferences.update(approved.id,'detailed')).value,'detailed');assert.equal(await preferences.remove(approved.id),true);
  for(const store of [history,notebook,preferences]){assert.equal(store.crossTabSafe,true);assert.equal(store.persistent,false);}history.dispose();notebook.dispose();
});

// C03: catches rejecting supported coordination or using different locks for the
// same store. The deterministic origin-lock adapter is not a real-browser race test.
test('origin locks retain normal durable deletion and stale mutation protections for all three stores',async t=>{
  const pending=new Map();browser(t,{request(name,operation){const next=(pending.get(name)||Promise.resolve()).catch(()=>{}).then(operation);pending.set(name,next);return next;}});
  const storage=disk();seeded(storage,HISTORY,archive);seeded(storage,MEMORY,memory);seeded(storage,PREFERENCES,{version:1,preferences:[preference]});
  const a=await createHistory(storage),b=await createHistory({...storage}),edit=b.revisionTarget(1);
  assert.equal(await a.remove('alpha'),true);const saved=storage.getItem(HISTORY);assert.equal(await b.replaceFrom(edit,'Deleted thread edit'),null);assert.equal(storage.getItem(HISTORY),saved);
  const first=createMemory(storage),second=createMemory({...storage});assert.deepEqual(await Promise.all([first.clear(),second.setMode('director')]),[true,true]);assert.deepEqual(second.snapshot(),{version:1,name:'',facts:[],history:[],mode:'director'});
  const one=createAdaptivePreferences(storage),two=createAdaptivePreferences({...storage});assert.deepEqual(await Promise.all([one.remove(preference.id),two.update(preference.id,'detailed')]),[true,null]);assert.deepEqual(two.context(),{});
  for(const store of [a,b,first,second,one,two])assert.equal(store.crossTabSafe,true);a.dispose();b.dispose();first.dispose();second.dispose();
});
