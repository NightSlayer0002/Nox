import {test,expect} from '@playwright/test';

// This journey deliberately enables the real worker. Other network-fault
// journeys remain isolated from workers so their interception stays meaningful.
test.use({serviceWorkers:'allow'});

test('a warmed public workspace starts after a real offline reload and keeps local learning usable',async({page,context})=>{
  await page.goto('/guest#learn');await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await expect(page.getByRole('slider',{name:/Move the Moon/})).toBeVisible();
  await page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  });
  // Warming is serialized. Wait for the entire loaded module/style graph,
  // not just early entries, before treating this shell as warmed.
  const needed=await page.evaluate(()=>[...new Set(['/guest',...performance.getEntriesByType('resource').flatMap(entry=>{
    const url=new URL(entry.name);return url.origin===location.origin&&!url.search&&/\.(?:js|css)$/.test(url.pathname)?[url.pathname]:[];
  })])]);
  await expect.poll(()=>page.evaluate(async paths=>{
    const checked=await Promise.all(paths.map(async path=>({path,cached:Boolean(await caches.match(path))})));
    return checked.filter(entry=>!entry.cached).map(entry=>entry.path);
  },needed)).toEqual([]);
  await context.setOffline(true);await page.reload();
  await expect(page.locator('#network-status')).toContainText('offline');
  const moon=page.getByRole('slider',{name:/Move the Moon/});await expect(moon).toBeVisible();await moon.fill('217');
  await expect(page.locator('.eact-moon output')).toHaveText('217°');
  await page.getByRole('button',{name:'Back to NOX',exact:true}).click();
  await expect(page.locator('#message')).toBeVisible();await page.locator('#message').fill('Keep this local offline thought');
  await expect(page.locator('#message')).toHaveValue('Keep this local offline thought');
  expect(await page.evaluate(async()=>{const names=await caches.keys();for(const name of names.filter(name=>name.startsWith('nox-shell-')))if((await (await caches.open(name)).keys()).some(request=>new URL(request.url).pathname.startsWith('/api/')))return true;return false;})).toBe(false);
});
