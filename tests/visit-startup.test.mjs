import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createVisitScope} from '../public/js/visit-storage.js';

// Evaluate the actual module body in an isolated async scope so its top-level
// await can be observed without stalling the test runner's module loader.
const source=(await readFile(new URL('../public/js/visit-scope.js',import.meta.url),'utf8'))
  .replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const evaluate=new (Object.getPrototypeOf(async function(){}).constructor)('createVisitScope','fetch','setTimeout','clearTimeout','AbortController','globalThis',`${source}\nreturn {visit,initialVisitStatus,requestVisitStatus};`);
const ownerStatus={owner:true,access:'open',brain:'live',providers:[{id:'groq',model:'fixture'}],provider:'groq'};
const response=status=>({ok:true,json:async()=>status});
const flush=async()=>{for(let index=0;index<6;index++)await Promise.resolve();};

function startup(responder,{pathname='/app'}={}){
  const timers=new Map(),requests=[],data=new Map([['private','OWNER ARCHIVE']]);
  let serial=0,storageAccesses=0;
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  const globals={crypto:globalThis.crypto,location:{pathname,search:''},get localStorage(){storageAccesses++;return storage;}};
  const loaded=evaluate(createVisitScope,(_url,options)=>{requests.push(options);return responder(options);},(callback,delay)=>{const id=++serial;timers.set(id,{callback,delay});return id;},id=>timers.delete(id),AbortController,globals);
  return {loaded,timers,requests,storage,get storageAccesses(){return storageAccesses;},respondWith(value){responder=value;},expire(){
    assert.equal(timers.size,1,'status verification must have one bounded deadline');
    const [id,timer]=timers.entries().next().value;
    assert.ok(timer.delay>0&&timer.delay<=10000,'status verification must finish within a short deadline');
    timers.delete(id);timer.callback();
  }};
}

test('a stalled status fetch releases startup into a temporary visit without opening owner storage',async()=>{
  let resolveStatus;
  const ui=startup(()=>new Promise(resolve=>{resolveStatus=resolve;}));
  await flush();ui.expire();
  const loaded=await ui.loaded;
  assert.equal(ui.requests[0].signal.aborted,true);
  assert.equal(loaded.initialVisitStatus,undefined);
  assert.equal(loaded.visit.owner,false);
  assert.equal(loaded.visit.storage.temporary,true);
  assert.equal(ui.storageAccesses,0);
  assert.equal(loaded.visit.storage.getItem('private'),null);
  resolveStatus(response(ownerStatus));await flush();
  assert.equal(loaded.visit.owner,false);
  assert.equal(ui.storageAccesses,0);
  assert.equal(ui.storage.getItem('private'),'OWNER ARCHIVE');
});

test('the startup deadline also bounds a response body that never finishes',async()=>{
  const ui=startup(async()=>({ok:true,json:()=>new Promise(()=>{})}));
  await flush();ui.expire();
  const loaded=await ui.loaded;
  assert.equal(loaded.visit.owner,false);
  assert.equal(loaded.visit.storage.temporary,true);
  assert.equal(ui.storageAccesses,0);
  assert.equal(ui.requests[0].signal.aborted,true);
});

test('successful owner verification clears the deadline before opening private storage',async()=>{
  const ui=startup(async()=>response(ownerStatus)),loaded=await ui.loaded;
  assert.equal(loaded.initialVisitStatus,ownerStatus);
  assert.equal(loaded.visit.owner,true);
  assert.equal(loaded.visit.storage,ui.storage);
  assert.equal(ui.storageAccesses,1);
  assert.equal(ui.timers.size,0);
  assert.equal(ui.requests[0].signal?.aborted,false);
  assert.equal(ui.requests[0].cache,'no-store');
});

test('an explicit guest request never opens owner storage even when its cookie belongs to an owner',async()=>{
  const guestProvider={id:'groq',model:'guest-model'};
  const ui=startup(async()=>response({...ownerStatus,guestProvider}),{pathname:'/guest'}),loaded=await ui.loaded;
  assert.equal(ui.requests[0].headers['x-nox-guest'],'1');
  assert.equal(loaded.initialVisitStatus.owner,false);
  assert.equal(loaded.initialVisitStatus.access,'guest');
  assert.equal(loaded.visit.owner,false);
  assert.equal(ui.storageAccesses,0);
  assert.equal(ui.timers.size,0);
});

test('status can be retried after timeout without upgrading the temporary visit or losing HTTP diagnostics',async()=>{
  const ui=startup(()=>new Promise(()=>{}));await flush();ui.expire();
  const loaded=await ui.loaded;
  ui.respondWith(async()=>({ok:false,status:401}));
  await assert.rejects(loaded.requestVisitStatus({headers:{authorization:'Bearer fixture'},forceGuest:false}),error=>error.status===401);
  assert.equal(ui.timers.size,0);
  ui.respondWith(async()=>response(ownerStatus));
  const checked=await loaded.requestVisitStatus({forceGuest:false});
  assert.equal(checked.owner,true);
  assert.equal(loaded.visit.owner,false);
  assert.equal(ui.storageAccesses,0);
  assert.equal(ui.timers.size,0);
});
