import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {FIRST_CONTACT} from '../../client/afterimage-example.js';

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

test('generating a different story resolves open edits and seeds its own editor',async({page})=>{
  // Question: Can draft retention silently apply previous-story text to a newly generated story, including typing during pending generation?
  // Limits: Real React/store/transport wiring with a synthetic story; not model creativity, live quota or physical-device typing.
  let requests=0,respond,entered;const requested=new Promise(resolve=>{entered=resolve;});const packet=structuredClone(FIRST_CONTACT);packet.title='A separately generated story';packet.signals[0].beats[0].speech='The new story starts here.';
  await page.route('**/api/afterimage',async route=>{requests++;entered();await new Promise(resolve=>{respond=resolve;});await route.fulfill({json:{packet}});});
  await page.goto('/app#afterimage');await expect(page.getByRole('button',{name:'Play this cut',exact:true})).toBeEnabled();await page.getByText('Create a new story',{exact:true}).click();await page.getByLabel('Start with a thought',{exact:true}).fill('A different story');
  await page.getByRole('button',{name:'Edit this cut',exact:true}).click();const first=page.locator('.cut-editor textarea').first();await first.fill('Draft belonging to the previous example.');await page.getByRole('button',{name:'Generate story',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('discard');expect(requests).toBe(0);await expect(first).toHaveValue('Draft belonging to the previous example.');
  await page.getByRole('button',{name:'Discard open edits',exact:true}).click();await page.getByRole('button',{name:'Edit this cut',exact:true}).click();await page.getByRole('button',{name:'Generate story',exact:true}).click();await requested;await expect(first).toBeDisabled();respond();
  await expect(page.locator('.reception-title')).toHaveText('A separately generated story');await page.getByRole('button',{name:'Edit this cut',exact:true}).click();await expect(first).toHaveValue('The new story starts here.');expect(requests).toBe(1);
});
