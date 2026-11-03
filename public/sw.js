// The build prepends RELEASE and ASSETS. Each worker controls one verified set
// of public files for its lifetime. Only a complete install can replace it.
const cacheName = 'nox-shell-' + RELEASE;
const workspaceRoutes = new Set(['/guest', '/guest/', '/app', '/app/', '/owner', '/owner/']);

async function releaseResponse(path, signal) {
  const response = await fetch(path, {cache:'no-store', credentials:'omit', redirect:'error', signal});
  if (!response.ok || response.type !== 'basic' || response.redirected ||
      /\bprivate\b/i.test(response.headers.get('cache-control') || '') ||
      /(?:^|,)\s*(?:cookie|authorization|\*)\s*(?:,|$)/i.test(response.headers.get('vary') || '') ||
      response.headers.has('set-cookie')) throw Error('Expected a public release asset');
  const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== ASSETS[path]) throw Error('Release asset changed during installation');
  return response;
}

async function installRelease() {
  const cache = await caches.open(cacheName);
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]);
  const pending = Object.keys(ASSETS).values();
  const workers = Array.from({length:8}, async () => {
    for (const path of pending) await cache.put(path, await releaseResponse(path, signal));
  });
  try {
    await Promise.all(workers);
  } catch (error) {
    controller.abort();
    await Promise.allSettled(workers);
    await caches.delete(cacheName);
    throw error;
  }
}

self.addEventListener('install', event => event.waitUntil(installRelease()));
// Let existing documents finish on their current worker before switching.
self.addEventListener('activate', event => event.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.filter(name => name.startsWith('nox-shell-') && name !== cacheName).map(name => caches.delete(name)));
})()));

self.addEventListener('fetch', event => {
  const {request} = event, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('authorization')) return;
  const documentPath = request.mode === 'navigate' &&
    (url.pathname === '/' ? '/index.html' : workspaceRoutes.has(url.pathname) && '/app.html');
  if (!documentPath && (url.search || url.hash || !Object.hasOwn(ASSETS, url.pathname))) return;
  const path = documentPath || url.pathname;
  event.respondWith((async () => {
    let cache;
    try {
      cache = await caches.open(cacheName);
      const saved = await cache.match(path);
      if (saved) return saved;
    } catch { /* Storage can be disabled independently of the network. */ }
    try {
      return await releaseResponse(path, AbortSignal.timeout(5000));
    } catch {
      if (!documentPath) return Response.error();
      const offline = await cache?.match('/offline.html').catch(() => null);
      return offline || new Response('NOX is offline. Connect to load the workspace. Guest conversations clear on refresh.', {
        status:503, headers:{'content-type':'text/plain; charset=utf-8'},
      });
    }
  })());
});
