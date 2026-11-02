import {test,expect} from '@playwright/test';

test('Stop cancels a generated fact waiting behind the native memory lock',async({page})=>{
  // Question: does a real browser discard a reply-owned personal fact when Stop occurs during a queued memory save?
  // Limits: one controlled native Web Lock ordering and a synthetic model packet; not every tab race, semantic memory consent or two-store atomic rollback.
  await page.route('**/api/chat',route=>route.fulfill({json:{speech:'I will remember that you like blue.',emotion:'neutral',action:'none',memory:'likes blue'}}));
  await page.goto('/app#conversation');await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
  await page.evaluate(()=>new Promise(resolve=>{window.heldMemory=navigator.locks.request('nox.memory.write',()=>new Promise(release=>{window.releaseMemory=release;resolve();}));}));
  await page.locator('#message').fill('Remember that I like blue.');await page.locator('#send-button').click();
  await expect.poll(()=>page.evaluate(async()=>(await navigator.locks.query()).pending.some(lock=>lock.name==='nox.memory.write'))).toBe(true);
  await page.locator('#cancel-reply').click();await page.evaluate(async()=>{releaseMemory();await heldMemory;});
  await expect.poll(()=>page.evaluate(async()=>(await navigator.locks.query()).pending.length)).toBe(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nox.memory.v1')).facts)).toEqual([]);
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nox.chats.v1')).threads[0].turns.map(turn=>turn.role))).toEqual(['user']);
});
