import {test,expect} from '@playwright/test';

for(const interruption of ['edit','stop'])test(`an answer queued behind the browser storage lock cannot survive ${interruption}`,async({page})=>{
  // Question: Does the real send→perform→history path enforce branch and cancellation ownership at its delayed final save?
  // Limits: Native Chromium Web Locks and local archive, synthetic provider; no model-quality, physical phone or remote billing claim.
  let respond,entered;const requested=new Promise(resolve=>{entered=resolve;});
  await page.route('**/api/chat',async route=>{await new Promise(resolve=>{respond=resolve;entered();});await route.fulfill({json:{speech:'Obsolete answer to the original question',emotion:'curious',action:'none',memory:''}});});
  await page.goto('/app#conversation');await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
  await page.locator('#message').fill('Original question');await page.locator('#send-button').click();await requested;
  await page.evaluate(async()=>{
    const {createHistory}=await import('/js/history.js');window.otherHistory=await createHistory(localStorage);
    await new Promise(resolve=>{window.blockedHistory=navigator.locks.request('nox.chat-history.write',()=>new Promise(release=>{window.releaseHistory=release;resolve();}));});
  });
  if(interruption==='edit')await page.evaluate(()=>{window.replacement=otherHistory.replaceFrom(otherHistory.revisionTarget(1),'Replacement question');});
  respond();
  await expect.poll(()=>page.evaluate(async()=>(await navigator.locks.query()).pending.filter(lock=>lock.name==='nox.chat-history.write').length)).toBe(interruption==='edit'?2:1);
  if(interruption==='stop')await page.locator('#cancel-reply').click();
  await page.evaluate(async()=>{releaseHistory();await blockedHistory;if(window.replacement)await replacement;});
  await expect(page.locator('#send-button')).toBeVisible();
  await expect.poll(()=>page.evaluate(async()=>{const {pending,held}=await navigator.locks.query();return pending.length+held.length;})).toBe(0);
  const contents=await page.evaluate(()=>JSON.parse(localStorage.getItem('nox.chats.v1')).threads.flatMap(t=>t.turns.map(v=>v.content)));
  expect(contents).toEqual([interruption==='edit'?'Replacement question':'Original question']);
  await page.reload();await expect(page.locator('#conversation .message.user .message-content')).toHaveText(interruption==='edit'?'Replacement question':'Original question');
  await expect(page.locator('#conversation')).not.toContainText('Obsolete answer');
});
