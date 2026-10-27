import {test,expect} from '@playwright/test';

for(const scope of ['guest','app'])test(`a newer ${scope} draft survives the actual pending history lock`,async({page})=>{
  await page.goto(`/${scope}#conversation`);await expect(page.locator('#brain-status')).toContainText(scope==='guest'?'Guest visit':'Synthetic CI provider');
  await page.evaluate(()=>new Promise(resolve=>{
    window.composerSaveLock=navigator.locks.request('nox.chat-history.write',()=>new Promise(release=>{window.releaseComposerSave=release;resolve();}));
  }));
  const input=page.locator('#message');await input.fill('Send this first thought');await page.locator('#send-button').click();
  await expect(page.locator('#cancel-reply')).toBeVisible();await input.fill('Keep this newer unfinished thought');
  await page.evaluate(async()=>{window.releaseComposerSave();await window.composerSaveLock;});
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toContainText('Send this first thought');
  await expect(input).toHaveValue('Keep this newer unfinished thought');
  await expect(page.locator('#conversation .message.user')).toHaveCount(1);
  await page.locator('#send-button').click();
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(2);await expect(input).toHaveValue('');
});
