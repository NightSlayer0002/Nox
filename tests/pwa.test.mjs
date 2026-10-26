import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

const origin='https://nox.example';
const workerSource=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
const installSource=await readFile(new URL('../public/js/install.js',import.meta.url),'utf8');
function response(body='public asset',options={}){
  const value=new Response(body,{status:options.status??200,headers:options.headers});
  Object.defineProperties(value,{type:{value:options.type??'basic'},redirected:{value:options.redirected??false},url:{value:options.url??''}});
  value.clone=()=>response(body,options);return value;
}
function worker({fetcher=async()=>response(),storageFailure=false,openFailure=false}={}){
  const listeners=new Map(),stores=new Map(),requests=[],deleted=[];
  const key=value=>new URL(typeof value==='string'?value:value.url,origin).href;
  function cacheFor(name){
    if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name);
    return {async addAll(urls){for(const url of urls)data.set(key(url),response(url));},async put(request,result){if(storageFailure)throw Error('Storage full');data.set(key(request),result);},async match(request){return data.get(key(request));},async keys(){return [...data.keys()].map(url=>new Request(url));},async delete(request){return data.delete(key(request));}};
  }
  const caches={open:async name=>{if(openFailure)throw Error('Cache unavailable');return cacheFor(name);},keys:async()=>[...stores.keys()],delete:async name=>{deleted.push(name);return stores.delete(name);}};
  const self={location:{origin},clients:{claim:async()=>{}},addEventListener:(name,callback)=>listeners.set(name,callback)};
  runInNewContext(workerSource,{self,caches,URL,Response,fetch:async input=>{requests.push(key(input));return fetcher(input);}});
  async function dispatch(name,options={}){
    let completion,result;const event={...options,waitUntil(value){completion=value;},respondWith(value){result=value;}};
    listeners.get(name)(event);const output=result?await result:undefined;if(completion)await completion;return output;
  }
  function request(path,options={}){return {url:new URL(path,origin).href,method:options.method??'GET',mode:options.mode??'cors',headers:new Headers(options.headers)};}
  return {dispatch,request,requests,stores,deleted,caches,cacheFor};
}

test('service worker installs a public offline core and removes only obsolete NOX caches',async()=>{
  const env=worker();await env.dispatch('install');
  const entries=[...env.stores.values()][0];assert.ok(entries.has(origin+'/offline.html'));assert.ok(entries.has(origin+'/offline.css'));
  assert.ok(entries.has(origin+'/icon.svg'));assert.ok(entries.has(origin+'/manifest.webmanifest'));
  assert.equal([...entries.keys()].some(url=>url.includes('/api/')||url.includes('/owner')),false);
  env.stores.set('nox-shell-obsolete',new Map());env.stores.set('unrelated-app',new Map());
  await env.dispatch('activate');assert.deepEqual(env.deleted,['nox-shell-obsolete']);assert.ok(env.stores.has('unrelated-app'));
});

test('service worker leaves APIs, authorization, query strings and unknown paths to the network',async()=>{
  const env=worker();
  for(const [path,options] of [
    ['/api/chat',{method:'POST'}],['/api/status',{}],['/api/status.js',{}],['/js/app.js',{method:'POST'}],
    ['/js/app.js',{headers:{authorization:'Bearer private-token'}}],['/js/app.js?token=private',{}],
    ['https://other.example/app.js',{}],['/private/export.js',{}],['/shared/private.js',{}],['/unknown', {mode:'navigate'}],
  ])assert.equal(await env.dispatch('fetch',{request:env.request(path,options)}),undefined,path);
  assert.equal(env.requests.length,0);assert.equal(env.stores.size,0);
});

test('public responses cache, but private, redirected and opaque responses never do',async()=>{
  for(const [name,options] of [
    ['public',{}],['private',{headers:{'cache-control':'private, max-age=60'}}],
    ['vary-cookie',{headers:{vary:'Cookie'}}],['vary-authorization',{headers:{vary:'Authorization'}}],
    ['set-cookie',{headers:{'set-cookie':'session=private'}}],['redirected',{redirected:true}],['opaque',{type:'opaque'}],
  ]){
    const env=worker({fetcher:async()=>response(name,options)}),request=env.request('/js/app.js');
    const result=await env.dispatch('fetch',{request});assert.equal(await result.text(),name);
    const stored=[...env.stores.values()].some(cache=>cache.has(request.url));assert.equal(stored,name==='public',name);
  }
});

test('a full device cache cannot turn a successful network response into an error',async()=>{
  const env=worker({storageFailure:true});const result=await env.dispatch('fetch',{request:env.request('/js/app.js')});
  assert.equal(result.status,200);assert.equal(await result.text(),'public asset');
});

test('disabled cache storage leaves online responses usable and offline navigation gives a recoverable explanation',async()=>{
  const online=worker({openFailure:true});assert.equal((await online.dispatch('fetch',{request:online.request('/js/app.js')})).status,200);
  const offline=worker({openFailure:true,fetcher:async()=>{throw Error('Offline');}});
  const result=await offline.dispatch('fetch',{request:offline.request('/guest',{mode:'navigate'})});
  assert.equal(result.status,503);assert.match(await result.text(),/offline|connect/i);
});

test('offline navigation restores the exact public shell, then guest shell, then the honest offline page',async()=>{
  const env=worker({fetcher:async()=>{throw Error('Offline');}});await env.dispatch('install');const store=[...env.stores.values()][0];
  store.set(origin+'/guest',response('guest shell'));store.set(origin+'/',response('home shell'));
  assert.equal(await (await env.dispatch('fetch',{request:env.request('/',{mode:'navigate'})})).text(),'home shell');
  assert.equal(await (await env.dispatch('fetch',{request:env.request('/app',{mode:'navigate'})})).text(),'guest shell');
  store.delete(origin+'/guest');assert.equal(await (await env.dispatch('fetch',{request:env.request('/guest',{mode:'navigate'})})).text(),'/offline.html');
  const missing=await env.dispatch('fetch',{request:env.request('/dist/missing.js')});assert.equal(missing.type,'error');
});

test('owner navigation can fall back to the public guest shell but is never added to the offline cache',async()=>{
  const env=worker();await env.dispatch('install');
  await env.dispatch('fetch',{request:env.request('/owner',{mode:'navigate'})});
  assert.equal([...env.stores.values()].some(cache=>cache.has(origin+'/owner')),false);
});

test('public-shell warming filters untrusted URLs, deduplicates and stays within the shared entry cap',async()=>{
  const env=worker();await env.dispatch('install');
  await env.dispatch('message',{data:{type:'cache-saved-shell',urls:[
    '/js/app.js','/js/app.js',origin+'/js/app.js','/api/chat.js','/private/export.js',
    '/js/secret.js?token=private','https://other.example/asset.js','/owner','/shared/private.js',
    '/assets/nox/ikari.png','/assets/nox/body-v1.glb',
  ]}});
  assert.deepEqual(env.requests.sort(),[origin+'/guest',origin+'/js/app.js',origin+'/assets/nox/ikari.png',origin+'/assets/nox/body-v1.glb'].sort());
  for(let round=0;round<3;round++)await env.dispatch('message',{data:{type:'cache-saved-shell',urls:Array.from({length:240},(_,i)=>`/dist/chunks/round-${round}-${i}.js`)}});
  const store=[...env.stores.values()][0];assert.ok(store.size<=220,`cached ${store.size} entries`);assert.ok(store.has(origin+'/offline.html'));assert.ok(store.has(origin+'/icon.svg'));assert.ok(store.has(origin+'/guest'),'The public guest shell survives later asset eviction without storing chat data');
  assert.ok(env.requests.length<=4+3*181,'each warm request is independently bounded');
});

test('public-shell warming never persists private responses and malformed messages do nothing',async()=>{
  const env=worker({fetcher:async()=>response('private',{headers:{'cache-control':'private'}})});
  await env.dispatch('message',{data:{type:'cache-saved-shell',urls:['/js/app.js']}});
  assert.equal([...env.stores.values()][0].size,0);
  for(const data of [undefined,{type:'other',urls:[]},{type:'cache-saved-shell',urls:'not an array'}])await env.dispatch('message',{data});
  assert.equal(env.requests.length,2);
});

test('concurrent asset requests cannot race past the cache entry bound',async()=>{
  const env=worker();await env.dispatch('install');
  await Promise.all(Array.from({length:245},(_,i)=>env.dispatch('fetch',{request:env.request(`/dist/chunks/asset-${i}.js`)})));
  const store=[...env.stores.values()][0];assert.ok(store.size<=220,`cached ${store.size} entries`);assert.ok(store.has(origin+'/offline.html'));
});

function installUI({online=true,register=async()=>({active:{postMessage(){}}})}={}){
  const events=new Map(),elements=new Map();let prevented=0;
  function element(id){return {id,hidden:true,disabled:false,textContent:'',dataset:{},listeners:new Map(),addEventListener(name,callback){this.listeners.set(name,callback);},setAttribute(){},after(value){elements.set(value.id,value);}};}
  for(const id of ['install-nox','install-note','header'])elements.set(id,element(id));
  const navigator={onLine:online,serviceWorker:{register,ready:Promise.resolve({active:{postMessage(){}}})}};
  const window={addEventListener:(name,callback)=>events.set(name,callback)};
  const document={body:{dataset:{}},getElementById:id=>elements.get(id),createElement:()=>element(''),querySelector:selector=>selector==='.header'?elements.get('header'):null};
  runInNewContext(installSource,{window,document,navigator,location:{protocol:'https:',hostname:'nox.example',origin},URL,performance:{getEntriesByType:()=>[]}});
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


test('every shared dependency of the application is eligible for warming and offline restoration',async()=>{
  const graph=await build({absWorkingDir:fileURLToPath(new URL('../',import.meta.url)),entryPoints:['public/js/app.js'],bundle:true,write:false,metafile:true,format:'esm',platform:'browser',external:['/dist/*','/js/*'],logLevel:'silent'});
  const modules=Object.keys(graph.metafile.inputs).filter(file=>file.startsWith('shared/')).map(file=>'/'+file);
  assert.ok(modules.includes('/shared/interface-state.js'),'the graph must include the observed startup dependency');
  let online=true;const env=worker({fetcher:async()=>{if(!online)throw Error('Offline');return response('cached shared module');}});
  await env.dispatch('message',{data:{type:'cache-saved-shell',urls:modules}});
  online=false;
  for(const path of modules){
    const restored=await env.dispatch('fetch',{request:env.request(path)});
    assert.ok(restored,`${path} must be handled by the public worker`);
    assert.equal(restored.status,200,`${path} must restore from the offline cache`);
  }
});


test('offline hash-route navigation restores the public shell without allowing asset fragments or queries',async()=>{
  const env=worker({fetcher:async()=>{throw Error('Offline');}});await env.dispatch('install');
  const store=[...env.stores.values()][0];store.set(origin+'/guest',response('cached public workspace'));
  const restored=await env.dispatch('fetch',{request:env.request('/guest#learn',{mode:'navigate'})});
  assert.ok(restored,'a normal hash-based workspace navigation must reach the worker');assert.equal(await restored.text(),'cached public workspace');
  assert.equal(await env.dispatch('fetch',{request:env.request('/js/app.js#private')}),undefined);
  assert.equal(await env.dispatch('fetch',{request:env.request('/guest?token=private#learn',{mode:'navigate'})}),undefined);
});
