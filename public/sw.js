// Cache only the public application shell and same-origin static assets.
// API responses, account status, keys and user messages are never cached.
const CACHE='nox-shell-v3';
const CORE=['/offline.html','/offline.css','/source-ui.css','/icon.svg','/assets/nox/icon-192.png','/assets/nox/icon-512.png','/manifest.webmanifest'];
const NAV=new Set(['/','/guest','/guest/','/app','/app/','/owner','/owner/']);
const PUBLIC_NAV=new Set(['/','/guest','/guest/','/app','/app/']);
const MAX_ENTRIES=220,MAX_WARM_URLS=180;
const PINNED=new Set([...CORE,'/guest']);
function publicAsset(url){
  if(url.origin!==self.location.origin||url.search||url.hash||url.username||url.password)return false;
  const path=url.pathname;
  return CORE.includes(path)||/^\/[a-z0-9-]+\.css$/i.test(path)||
    /^\/(?:js|dist|assets|vendor|fonts)\/[^?]+\.(?:js|css|svg|png|jpg|woff2?|ttf|glb|bin|glsl|vert|frag)$/i.test(path)||
    ['/shared/character.js','/shared/afterimage.js'].includes(path);
}
function publicResponse(response){
  return response.ok&&response.type==='basic'&&!response.redirected&&
    !/\bprivate\b/i.test(response.headers.get('cache-control')||'')&&
    !/(?:^|,)\s*(?:cookie|authorization|\*)\s*(?:,|$)/i.test(response.headers.get('vary')||'')&&
    !response.headers.has('set-cookie');
}
// Serialize writes and eviction: parallel module requests must share one bound.
// The server deliberately marks even these known public shell files no-store;
// only this static allowlist is persisted, never a general response cache.
let writes=Promise.resolve(),warming=false;
function remember(request,response){
  const copy=response.clone();
  const next=writes.then(async()=>{
    const cache=await caches.open(CACHE);await cache.put(request,copy);
    const keys=await cache.keys(),removable=keys.filter(key=>!PINNED.has(new URL(key.url).pathname));
    for(let count=keys.length-MAX_ENTRIES;count>0&&removable.length;count--)await cache.delete(removable.shift());
  });
  // Device storage failure must not discard a successful online response.
  writes=next.catch(()=>{});return writes;
}
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('nox-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{
  if(event.data?.type!=='cache-saved-shell'||!Array.isArray(event.data.urls)||warming)return;
  warming=true;
  event.waitUntil((async()=>{
    try{
      const cache=await caches.open(CACHE),urls=new Set([self.location.origin+'/guest']);
      for(const value of event.data.urls.slice(0,MAX_WARM_URLS*4)){
        if(urls.size>MAX_WARM_URLS)break;
        if(typeof value!=='string')continue;
        try{const url=new URL(value,self.location.origin);if(publicAsset(url))urls.add(url.href);}catch{}
      }
      for(const url of urls){
        try{
          if(await cache.match(url))continue;
          const response=await fetch(url);if(publicResponse(response))await remember(url,response);
        }catch{/* A missing asset never changes the loaded visit. */}
      }
    }catch{/* Offline shell preparation is optional. */}
    finally{warming=false;}
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.search||url.hash||request.headers.has('authorization'))return;
  const navigation=request.mode==='navigate'&&NAV.has(url.pathname);
  const asset=publicAsset(url);
  if(!navigation&&!asset)return;
  event.respondWith((async()=>{
    try{
      const response=await fetch(request);
      if(publicResponse(response)&&(asset||PUBLIC_NAV.has(url.pathname)))event.waitUntil(remember(request,response));
      return response;
    }catch{
      try{
        const cache=await caches.open(CACHE),saved=(asset||PUBLIC_NAV.has(url.pathname))&&await cache.match(request);if(saved)return saved;
        if(navigation){const fallback=await cache.match('/guest')||await cache.match('/offline.html');if(fallback)return fallback;}
      }catch{/* Browsers can disable Cache Storage independently of networking. */}
      if(navigation)return new Response('NOX is offline. Connect to load the workspace. Guest conversations clear on refresh.',{status:503,headers:{'content-type':'text/plain; charset=utf-8'}});
      return Response.error();
    }
  })());
});
