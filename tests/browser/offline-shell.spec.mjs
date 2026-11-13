import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';

// This journey deliberately enables the real worker. Other network-fault
// journeys remain isolated from workers so their interception stays meaningful.
test.use({serviceWorkers:'allow'});

test('an installed release starts after a real offline reload and keeps local learning usable',async({page,context})=>{
  await page.goto('/guest#learn');await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await expect(page.getByRole('slider',{name:/Move the Moon/})).toBeVisible();
  await page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
  });
  const needed=await page.evaluate(()=>[...new Set(['/app.html',...performance.getEntriesByType('resource').flatMap(entry=>{
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

// Question: does a waiting release leave a fresh landing page quiet while
// protecting an open draft? Limits: local two-release fixture, not Vercel CDN behavior.
test('a waiting release prompts in the workspace and leaves a fresh landing page quiet',async({page,context})=>{
  const [worker,watcher]=await Promise.all(['sw.js','js/release-update.js'].map(file=>readFile(new URL('../../public/'+file,import.meta.url),'utf8')));
  let release='old';
  const server=createServer((request,response)=>{
    const markup=bodyClass=>`<!doctype html><title>NOX release fixture</title><body class="${bodyClass}"><h1>${release} shell</h1><textarea aria-label="Guest draft"></textarea><script type="module" src="/js/release-update.js"></script></body>`;
    const files={'/index.html':markup('landing'),'/app.html':markup('workspace'),'/offline.html':'offline','/js/release-update.js':watcher};
    const pathname=new URL(request.url,'http://localhost').pathname;
    response.setHeader('cache-control','no-store');
    if(pathname==='/sw.js'){
      const manifest=Object.fromEntries(Object.entries(files).map(([path,content])=>[path,createHash('sha256').update(content).digest('hex')]));
      response.setHeader('content-type','text/javascript');
      return response.end(`const RELEASE=${JSON.stringify(release)},ASSETS=${JSON.stringify(manifest)};\n${worker}`);
    }
    const path=pathname==='/'?'/index.html':pathname==='/guest'?'/app.html':pathname;
    response.setHeader('content-type',path.endsWith('.js')?'text/javascript':'text/html');
    response.end(files[path]||'');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const notice=tab=>tab.getByRole('complementary',{name:'NOX update'});
  try{
    await page.goto(origin+'/guest');
    await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
    await page.reload();
    await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
    await expect(notice(page)).toHaveCount(0);
    await page.getByRole('textbox',{name:'Guest draft'}).fill('Keep this open while NOX updates');
    release='new';
    await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
    await expect(notice(page)).toContainText('close all NOX tabs');
    await expect(page.getByRole('textbox',{name:'Guest draft'})).toHaveValue('Keep this open while NOX updates');

    const landing=await context.newPage();
    await landing.goto(origin);
    await expect(landing.getByRole('heading')).toHaveText('old shell');
    await landing.evaluate(async()=>{
      await import('/js/release-update.js');
      if (!(await navigator.serviceWorker.getRegistration()).waiting) throw new Error('Expected a waiting release');
    });
    await expect(notice(landing)).toHaveCount(0);
    await expect(notice(page)).toBeVisible();
    await Promise.all([landing.close(),page.close()]);

    const reopened=await context.newPage();
    await reopened.goto(origin);
    await expect(reopened.getByRole('heading')).toHaveText('new shell');
    await expect(notice(reopened)).toHaveCount(0);
  }finally{
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
});
