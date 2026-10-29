import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

for(const owner of [false,true])test(`${owner?'owner':'guest'} unapplied story draft survives disclosure and route changes`,async({page})=>{
  // Question: Does actual React route unmount/remount retain unapplied text and export it without changing the performed cut?
  // Limits: Chromium with synthetic media and one current cut; not refresh persistence, physical devices, or restoration from exported files.
  await page.goto(`/${owner?'app':'guest'}#afterimage`);await expect(page.getByRole('button',{name:'Play this cut',exact:true})).toBeEnabled();
  const applied=await page.locator('.cue-tape li p').first().textContent();
  await page.getByRole('button',{name:'Edit this cut',exact:true}).click();const first=page.locator('.cut-editor textarea').first();await first.fill('A draft still waiting to be applied.');
  await page.getByRole('button',{name:'Edit this cut',exact:true}).click();await expect(page.locator('.cut-editor')).toBeHidden();
  await page.getByRole('button',{name:'Edit this cut',exact:true}).click();await expect(first).toHaveValue('A draft still waiting to be applied.');
  await page.getByRole('link',{name:'Talk with NOX',exact:true}).click();await expect(page.locator('.afterimage-receiver')).toBeHidden();
  await page.evaluate(()=>location.hash='#afterimage');await expect(first).toHaveValue('A draft still waiting to be applied.');await expect(page.locator('.cue-tape li p').first()).toHaveText(applied);
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Export open edits',exact:true}).click();const download=await downloading;expect(await readFile(await download.path(),'utf8')).toContain('A draft still waiting to be applied.');
  await page.getByRole('button',{name:'Apply edits',exact:true}).click();await expect(first).toBeHidden();await expect(page.locator('.cue-tape li p').first()).toHaveText('A draft still waiting to be applied.');
});
