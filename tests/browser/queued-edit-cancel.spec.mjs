import {test,expect} from '@playwright/test';

for(const owner of [false,true])for(const cancelBy of ['button','Escape'])test(`${owner?'owner':'guest'} ${cancelBy} cancels an edit waiting on the real storage lock`,async({page})=>{
  // Question: Does the visible Cancel/Escape action cancel a pending destructive save before any provider work?
  // Limits: Chromium Web Locks, synthetic HTTP and desktop input; not all browser engines, real provider cancellation or physical mobile behavior.
  const requests=[];page.on('request',request=>{if(new URL(request.url()).pathname==='/api/chat')requests.push(request);});
  await page.goto(`/${owner?'app':'guest'}#conversation`);await expect(page.locator('#brain-status')).toContainText(owner?'Synthetic CI provider':'Guest visit');
  const input=page.locator('#message');
  for(const [index,text] of ['Original question','Later question'].entries()){
    await input.fill(text);await page.locator('#send-button').click();await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(index+1);
  }
  await input.fill('Earlier unfinished draft');await page.locator('#conversation .message.user').first().getByRole('button',{name:'Edit your message',exact:true}).click();await input.fill('Queued correction');
  const saved=owner?await page.evaluate(()=>localStorage.getItem('nox.chats.v1')):null;
  await page.evaluate(()=>new Promise(resolve=>{window.blockedHistory=navigator.locks.request('nox.chat-history.write',()=>new Promise(release=>{window.releaseHistory=release;resolve();}));}));
  await page.locator('#send-button').click();
  await expect.poll(()=>page.evaluate(async()=>(await navigator.locks.query()).pending.some(lock=>lock.name==='nox.chat-history.write'))).toBe(true);
  await expect(page.getByRole('group',{name:'Message revision'})).toContainText('Saving edit');
  if(cancelBy==='Escape')await input.press('Escape');else await page.getByRole('button',{name:'Cancel edit',exact:true}).click();
  await expect(input).toHaveValue('Earlier unfinished draft');await expect(page.locator('#send-button')).toBeVisible();
  await page.evaluate(async()=>{releaseHistory();await blockedHistory;});
  await expect.poll(()=>page.evaluate(async()=>{const {pending,held}=await navigator.locks.query();return pending.length+held.length;})).toBe(0);
  await expect(page.locator('#conversation .message')).toHaveCount(4);await expect(page.locator('#conversation .message.user .message-content')).toHaveText(['Original question','Later question']);
  expect(requests).toHaveLength(2);if(owner)expect(await page.evaluate(()=>localStorage.getItem('nox.chats.v1'))).toBe(saved);
});
