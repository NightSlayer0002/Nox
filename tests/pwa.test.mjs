import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';

const origin='https://nox.example';
const workerSource=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
const installSource=await readFile(new URL('../public/js/install.js',import.meta.url),'utf8');

const digest=body=>createHash('sha256').update(body).digest('hex');
function response(body,headers){
  const value=new Response(body,{headers});
  Object.defineProperty(value,'type',{value:'basic'});
  return value;
}

function storage(){
  const stores=new Map();
  return {
    stores,
    async open(name){
      if(!stores.has(name))stores.set(name,new Map());
      const data=stores.get(name);
      return {async put(path,result){data.set(path,result);},async match(path){return data.get(path)?.clone();}};
    },
    async keys(){return [...stores.keys()];},
    async delete(name){return stores.delete(name);},
  };
}

function worker({release='fixture',caches=storage(),assets,fetcher,deadline=30000}){
  const listeners=new Map(),requests=[];
  const manifest=Object.fromEntries(Object.entries(assets).map(([path,body])=>[path,digest(body)]));
  const self={location:{origin},addEventListener:(name,callback)=>listeners.set(name,callback)};
  runInNewContext(workerSource,{self,caches,URL,Response,AbortController,AbortSignal:{any:AbortSignal.any,timeout:()=>AbortSignal.timeout(deadline)},crypto,RELEASE:release,ASSETS:manifest,
    fetch:async (path,options)=>{requests.push(path);return fetcher?fetcher(path,options):response(assets[path]);}});
  async function dispatch(name,options={}){
    let completion,result;
    const event={...options,waitUntil(value){completion=value;},respondWith(value){result=value;}};
    listeners.get(name)(event);
    if(completion)await completion;
    return result;
  }
  function get(path,{mode='cors',method='GET',headers}={}){
    return dispatch('fetch',{request:{url:new URL(path,origin).href,method,mode,headers:new Headers(headers)}});
  }
  return {dispatch,get,caches,requests};
}

const oldAssets={'/app.html':'old workspace','/index.html':'home','/offline.html':'offline','/js/app.js':'import old','/js/old.js':'old dependency'};
const newAssets={'/app.html':'new workspace','/index.html':'home','/offline.html':'offline','/js/app.js':'import new','/js/new.js':'new dependency'};

for(const failure of ['disconnect','mismatched asset','private response','quota','stalled fetch'])test(`interrupted offline install leaves the active release intact after ${failure}`,async()=>{
  // Question: can an incomplete or invalid release replace files still used by the active worker?
  // Limits: real worker handlers, simulated CacheStorage and network. Native activation timing has a browser test.
  const caches=storage(),old=worker({release:'old',caches,assets:oldAssets});
  await old.dispatch('install');
  const originalOpen=caches.open;
  if(failure==='quota')caches.open=async name=>{
    const cache=await originalOpen(name);
    if(name==='nox-shell-new')cache.put=async()=>{throw Error('Storage full');};
    return cache;
  };
  const next=worker({release:'new',caches,assets:newAssets,deadline:failure==='stalled fetch'?15:30000,fetcher:async(path,{signal})=>{
    if(path!=='/js/new.js')return response(newAssets[path]);
    if(failure==='mismatched asset')return response('old deployment bytes');
    if(failure==='private response')return response(newAssets[path],{'cache-control':'private'});
    if(failure==='stalled fetch')return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
    if(failure==='disconnect')throw Error('Offline');
    return response(newAssets[path]);
  }});
  await assert.rejects(next.dispatch('install'));
  assert.deepEqual(await caches.keys(),['nox-shell-old']);
  assert.equal(await (await old.get('/guest#learn',{mode:'navigate'})).text(),'old workspace');
  assert.equal(await (await old.get('/js/app.js')).text(),'import old');
  assert.equal(await (await old.get('/js/old.js')).text(),'old dependency');
});

test('a complete release activates and serves one graph without persisting private routes',async()=>{
  const caches=storage(),old=worker({release:'old',caches,assets:oldAssets});
  await old.dispatch('install');await caches.open('another-app');
  const next=worker({release:'new',caches,assets:newAssets});
  await next.dispatch('install');
  assert.equal(await (await old.get('/js/app.js')).text(),'import old');
  await next.dispatch('activate');
  assert.deepEqual(await caches.keys(),['another-app','nox-shell-new']);
  for(const route of ['/guest#learn','/app','/owner','/guest?prepare=code'])assert.equal(await (await next.get(route,{mode:'navigate'})).text(),'new workspace');
  assert.equal(await (await next.get('/js/new.js')).text(),'new dependency');
  for(const route of ['/api/status','/js/private.js','/js/app.js?token=private','https://elsewhere.example/js/app.js'])assert.equal(await next.get(route),undefined);
  assert.equal(await next.get('/js/app.js',{headers:{authorization:'Bearer fixture'}}),undefined);
  assert.equal(await next.get('/js/app.js',{method:'POST'}),undefined);
  assert.deepEqual([...caches.stores.get('nox-shell-new').keys()].sort(),Object.keys(newAssets).sort());
});

test('a missing cached file cannot be replaced with bytes from a newer deployment',async()=>{
  const caches=storage();
  const env=worker({caches,assets:oldAssets,fetcher:async path=>response(path==='/app.html'?'new workspace':'new dependency')});
  assert.equal((await env.get('/js/app.js')).type,'error');
  assert.equal((await env.get('/guest',{mode:'navigate'})).status,503);
});
function installUI({online=true,register=async()=>{}}={}){
  const events=new Map(),elements=new Map();let prevented=0;
  function element(id){return {id,hidden:true,disabled:false,textContent:'',dataset:{},listeners:new Map(),addEventListener(name,callback){this.listeners.set(name,callback);},setAttribute(){},after(value){elements.set(value.id,value);}};}
  for(const id of ['install-nox','install-note','header'])elements.set(id,element(id));
  const navigator={onLine:online,serviceWorker:{register,ready:Promise.resolve().then(()=>register())}};
  const window={addEventListener:(name,callback)=>events.set(name,callback)};
  const document={body:{dataset:{}},getElementById:id=>elements.get(id),createElement:()=>element(''),querySelector:selector=>selector==='.header'?elements.get('header'):null};
  runInNewContext(installSource,{window,document,navigator,location:{protocol:'https:',hostname:'nox.example',origin}});
  return {elements,events,navigator,async offer(outcome){await events.get('beforeinstallprompt')({preventDefault(){prevented++;},prompt:async()=>{},userChoice:Promise.resolve({outcome})});},click:()=>elements.get('install-nox').listeners.get('click')(),prevented:()=>prevented};
}

test('a consumed install prompt is hidden after dismissal and a later browser offer re-enables it',async()=>{
  const ui=installUI();await ui.offer('dismissed');assert.equal(ui.elements.get('install-nox').hidden,false);assert.equal(ui.prevented(),1);
  await ui.click();assert.equal(ui.elements.get('install-nox').hidden,true);assert.equal(ui.elements.get('install-nox').disabled,false);
  assert.match(ui.elements.get('install-note').textContent,/browser|home screen/i);
  await ui.offer('accepted');assert.equal(ui.elements.get('install-nox').hidden,false);
});

test('accepting installation waits for browser confirmation before claiming NOX is installed',async()=>{
  const ui=installUI();await ui.offer('accepted');await ui.click();assert.doesNotMatch(ui.elements.get('install-note').textContent,/has been added|is installed/i);
  ui.events.get('appinstalled')();assert.equal(ui.elements.get('install-nox').hidden,true);assert.match(ui.elements.get('install-note').textContent,/installed/i);
});

test('offline UI preserves access to loaded local content without promising offline AI',()=>{
  const ui=installUI({online:false}),status=ui.elements.get('network-status');assert.equal(status.hidden,false);assert.equal(ui.elements.get('header').id,'header');
  assert.match(status.textContent,/local activities/);assert.match(status.textContent,/AI replies need a connection/);
  ui.navigator.onLine=true;ui.events.get('online')();assert.equal(status.hidden,true);
});

test('manifest offers practical 192 and 512 pixel icons derived from the existing NOX mark',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.start_url,'/guest#conversation');assert.equal(manifest.display,'standalone');
  for(const size of [192,512]){
    const icon=manifest.icons.find(value=>value.sizes===`${size}x${size}`&&value.type==='image/png');assert.ok(icon,`${size}px PNG icon`);
    const bytes=await readFile(new URL('../public'+icon.src,import.meta.url));assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
  }
  assert.ok(manifest.icons.some(value=>value.src==='/icon.svg'),'original vector stays available');
});
