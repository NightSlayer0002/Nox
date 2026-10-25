import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createVisitScope} from '../public/js/visit-storage.js';

// Evaluate the actual module body in an isolated async scope so its top-level
// await can be observed without stalling the test runner's module loader.
const source=(await readFile(new URL('../public/js/visit-scope.js',import.meta.url),'utf8'))
  .replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const evaluate=new (Object.getPrototypeOf(async function(){}).constructor)('createVisitScope','fetch','setTimeout','clearTimeout','AbortController','globalThis',`${source}\nreturn {visit,initialVisitStatus,requestVisitStatus,initialVisitStatusPromise:typeof initialVisitStatusPromise==='undefined'?undefined:initialVisitStatusPromise};`);
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
    assert.equal(timer.delay,5000,'status verification bounds headers and body with the same five-second deadline');
    timers.delete(id);timer.callback();
  }};
}

for(const phase of ['headers','body'])test(`explicit guests can use their temporary visit while status ${phase} are pending`,async()=>{
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  const ui=startup(()=>phase==='headers'?pending:Promise.resolve({ok:true,json:()=>pending}),{pathname:'/guest'});
  let loaded;ui.loaded.then(value=>{loaded=value;});await flush();
  assert.ok(loaded,'Explicit guest modules must initialize before the connection check finishes');
  assert.equal(loaded.visit.owner,false);assert.equal(loaded.visit.storage.temporary,true);assert.equal(ui.storageAccesses,0);
  assert.equal(ui.requests.length,1);assert.equal(ui.requests[0].headers['x-nox-guest'],'1');
  loaded.visit.storage.setItem('draft','Keep the thought typed during startup');
  const status={...ownerStatus,guestProvider:{id:'groq',model:'guest-model'}};
  release(phase==='headers'?response(status):status);
  const checked=await loaded.initialVisitStatusPromise;
  assert.equal(checked.owner,false);assert.equal(checked.provider,'groq');
  assert.equal(loaded.visit.owner,false);assert.equal(ui.storageAccesses,0);assert.equal(ui.requests.length,1);
  assert.equal(loaded.visit.storage.getItem('draft'),'Keep the thought typed during startup');assert.equal(ui.timers.size,0);
});

for(const pathname of ['/app','/owner'])test(`${pathname} waits for verification before exposing private storage`,async()=>{
  let release;const ui=startup(()=>new Promise(resolve=>{release=resolve;}),{pathname});
  let loaded;ui.loaded.then(value=>{loaded=value;});await flush();
  assert.equal(loaded,undefined);assert.equal(ui.storageAccesses,0);
  release(response(ownerStatus));loaded=await ui.loaded;
  assert.equal(loaded.visit.owner,true);assert.equal(loaded.visit.storage,ui.storage);assert.equal(ui.storageAccesses,1);
  assert.equal(await loaded.initialVisitStatusPromise,ownerStatus);assert.equal(ui.requests.length,1);
});

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
  const checked=await loaded.initialVisitStatusPromise;
  assert.equal(checked.owner,false);
  assert.equal(checked.access,'guest');
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

test('a guest deadline rejects the shared initial check and a retry keeps the same temporary work',async()=>{
  const ui=startup(()=>new Promise(()=>{}),{pathname:'/guest'});
  let loaded;ui.loaded.then(value=>{loaded=value;});await flush();
  assert.ok(loaded,'A stalled guest connection must not block local work');
  loaded.visit.storage.setItem('draft','Keep this draft');
  const rejected=assert.rejects(loaded.initialVisitStatusPromise,{name:'TimeoutError'});ui.expire();await rejected;
  assert.equal(ui.requests[0].signal.aborted,true);assert.equal(ui.timers.size,0);
  ui.respondWith(async()=>response({...ownerStatus,guestProvider:{id:'groq',model:'guest-model'}}));
  const checked=await loaded.requestVisitStatus();assert.equal(checked.owner,false);assert.equal(ui.requests.length,2);
  assert.equal(loaded.visit.storage.getItem('draft'),'Keep this draft');assert.equal(loaded.visit.owner,false);assert.equal(ui.storageAccesses,0);
});

test('an initial guest HTTP error stays observable and can be retried without upgrading the visit',async()=>{
  const ui=startup(async()=>({ok:false,status:503}),{pathname:'/guest'}),loaded=await ui.loaded;
  await assert.rejects(loaded.initialVisitStatusPromise,error=>error.status===503);
  assert.equal(ui.requests.length,1);assert.equal(ui.timers.size,0);
  ui.respondWith(async()=>response(ownerStatus));assert.equal((await loaded.requestVisitStatus({forceGuest:false})).owner,true);
  assert.equal(loaded.visit.owner,false);assert.equal(ui.storageAccesses,0);assert.equal(ui.requests.length,2);
});

test('pending connection submissions preserve an edited draft before touching conversation history',async()=>{
  const app=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
  const send=app.slice(app.indexOf('async function send('),app.indexOf('\nconst greetings ='));
  let edits=0,status='';const input={value:'My unsent revision'};
  const context={composerOptions:{close(){}},busy:false,brain:'loading',editTarget:1,$:()=>input,
    history:{async replaceFrom(){edits++;return null;}},toast(){},replyDiagnostics:{setStatus:value=>{status=value;}}};
  runInNewContext(send,context);await context.send(input.value);
  assert.equal(edits,0);assert.equal(input.value,'My unsent revision');assert.equal(context.editTarget,1);assert.match(status,/connection|checking/i);
});

for(const name of ['activity','discovery'])test(`pending ${name} handoffs keep the current work until a connected retry`,async()=>{
  const app=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8'),start=app.indexOf('companionBridge.connect({');
  const handlers=app.slice(start,app.indexOf('\napplyApprovedPreferences();',start));
  let companion,everyday,created=0;const views=[],sent=[],remembered=[],notices=[];
  const context={brain:'loading',currentActivity:'conversation',companionBridge:{connect:adapter=>{companion=adapter;}},EverydayBridge:{connect:adapter=>{everyday=adapter;}},
    async newConversation(){created++;return true;},navigation:{setView:view=>views.push(view)},send:async text=>sent.push(text),rememberActivity:(...args)=>remembered.push(args),applyApprovedPreferences(){},toast:notice=>notices.push(notice)};
  runInNewContext(handlers,context);
  const prompt='Keep this question about the Moon',options={activity:{kind:'explore',id:'lesson-id',state:{angle:217,teachBack:'My explanation'}}};
  const handoff=()=>name==='activity'?everyday.ask(prompt,options):companion.start(prompt,'mystery');
  await handoff();assert.equal(created,0);assert.deepEqual(views,[]);assert.deepEqual(sent,[]);assert.deepEqual(remembered,[]);
  assert.equal(context.currentActivity,'conversation');assert.match(notices[0],/connection.*not ready|connecting/i);
  context.brain='live';await handoff();assert.equal(created,1);assert.deepEqual(views,['conversation']);assert.deepEqual(sent,[prompt]);
  assert.equal(context.currentActivity,name==='activity'?'explore':'mystery');
  assert.equal(remembered.length,name==='activity'?1:0);
});
