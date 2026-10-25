import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import path from 'node:path';

// Compile the relevant current-source UI in memory without changing dist.
// Settings markup, controller, storage and preference bridge remain real.
let hub;
test.beforeAll(async()=>{
  const result=await build({stdin:{contents:"import {mountCompanionHub} from './client/companion-hub.jsx'; mountCompanionHub();",resolveDir:path.resolve(import.meta.dirname,'../..'),loader:'jsx'},bundle:true,write:false,format:'esm',platform:'browser',minify:true,external:['/js/*']});
  hub=result.outputFiles[0].text;
});
test.beforeEach(async({page})=>{
  await page.route('**/dist/workspace.js',route=>route.fulfill({contentType:'text/javascript',body:hub}));
});
async function ready(page,route='/guest#conversation'){
  await page.goto(route);await expect(page.locator('#connection-help')).toBeHidden();
  await page.evaluate(async()=>{
    window.settingsPreferences=(await import('/js/companion-context.js')).approvedPreferences;
    window.settingsProposalCount=0;window.addEventListener('nox:preference-proposal',()=>settingsProposalCount++);
  });
}

test('a pace selected with Settings open applies to the next turn without a second approval',async({page})=>{
  await ready(page);await page.locator('#settings-button').click();
  await page.getByLabel('Speech pace',{exact:true}).selectOption('0.85');
  await expect.poll(()=>page.evaluate(()=>settingsPreferences.context().speechPace)).toBe(.85);
  await expect(page.locator('#inside-dialog')).toBeVisible();
  await expect(page.locator('#speech-pace-note')).toContainText(/this visit.*refresh/i);
  expect(await page.evaluate(()=>settingsProposalCount)).toBe(0);
  await expect(page.getByLabel('Approve a preference')).toHaveCount(0);
  await page.screenshot({path:'artifacts/settings-browser-preview.png'});
  await page.locator('#close-inside').click();
  const request=page.waitForRequest(request=>request.url().endsWith('/api/chat'));
  await page.locator('#message').fill('CI keep the selected pace');await page.locator('#send-button').click();
  expect((await request).postDataJSON().context.preferences.speechPace).toBe(.85);
  await page.locator('#settings-button').click();await expect(page.getByLabel('Speech pace',{exact:true})).toHaveValue('0.85');
  await page.reload();await expect(page.locator('#connection-help')).toBeHidden();await page.locator('#settings-button').click();
  await expect(page.getByLabel('Speech pace',{exact:true})).toHaveValue('1');
});

test('explicit Preferences choices apply once and retain their learning scope',async({page})=>{
  await ready(page,'/guest#memory');
  await page.getByRole('button',{name:/Let me try first|Hints when learning/}).click();
  await expect.poll(()=>page.evaluate(()=>settingsPreferences.context('learning').learningStyle)).toBe('hints');
  expect(await page.evaluate(()=>settingsPreferences.context().learningStyle)).toBeUndefined();
  expect(await page.evaluate(()=>settingsProposalCount)).toBe(0);
  await expect(page.getByLabel('Approve a preference')).toHaveCount(0);
  await page.screenshot({path:'artifacts/preferences-browser-preview.png'});
});

test('an inferred chat preference still waits for approval',async({page})=>{
  await ready(page);await page.locator('#message').fill('Keep your answers shorter.');await page.locator('#send-button').click();
  const confirmation=page.getByLabel('Approve a preference');await expect(confirmation).toBeVisible();
  expect(await page.evaluate(()=>settingsPreferences.context().answerLength)).toBeUndefined();
  await confirmation.getByRole('button',{name:'Apply for this visit',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>settingsPreferences.context().answerLength)).toBe('short');
});

test('only the selected engine exposes its speaker while both choices survive switching',async({page})=>{
  await page.addInitScript(()=>{speechSynthesis.getVoices=()=>[{name:'CI Browser Voice',lang:'en-US'}];});
  await page.route('**/api/status',async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),voice:'natural'}});});
  await ready(page);await page.locator('#settings-button').click();
  const natural=page.getByLabel('Orpheus character voice',{exact:true}),browser=page.getByLabel('Browser voice',{exact:true});
  await page.getByLabel('Voice',{exact:true}).selectOption('browser');await expect(natural).toBeHidden();await expect(browser).toBeVisible();
  await browser.selectOption('CI Browser Voice');
  await page.getByLabel('Voice',{exact:true}).selectOption('natural');await expect(browser).toBeHidden();await expect(natural).toBeVisible();await natural.selectOption('daniel');
  await page.getByLabel('Voice',{exact:true}).selectOption('browser');await expect(browser).toHaveValue('CI Browser Voice');
  await page.getByLabel('Voice',{exact:true}).selectOption('natural');await expect(natural).toHaveValue('daniel');
});

test('failed owner pace storage keeps the prior setting and reports failure inside Settings',async({page})=>{
  await ready(page,'/app#conversation');await page.locator('#settings-button').click();
  await page.getByLabel('Speech pace',{exact:true}).selectOption('0.85');
  await expect.poll(()=>page.evaluate(()=>settingsPreferences.context().speechPace)).toBe(.85);
  await page.evaluate(()=>{const write=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.endsWith('nox.approved-preferences.v1'))throw new DOMException('Synthetic storage full','QuotaExceededError');return write.call(this,key,value);};});
  await page.getByLabel('Speech pace',{exact:true}).selectOption('1.15');
  await expect(page.locator('#speech-pace-note')).toContainText(/could not.*pace|pace.*could not/i);
  await expect(page.getByLabel('Speech pace',{exact:true})).toHaveValue('0.85');
  expect(await page.evaluate(()=>settingsPreferences.context().speechPace)).toBe(.85);
  await expect(page.locator('#inside-dialog')).toBeVisible();
});

test('an explicit owner pace survives reopening and refreshing',async({page})=>{
  await ready(page,'/app#conversation');await page.locator('#settings-button').click();await page.getByLabel('Speech pace',{exact:true}).selectOption('1.15');
  await expect.poll(()=>page.evaluate(()=>settingsPreferences.context().speechPace)).toBe(1.15);
  await expect(page.locator('#speech-pace-note')).toContainText(/saved.*device/i);
  await page.reload();await expect(page.locator('#connection-help')).toBeHidden();await page.locator('#settings-button').click();
  await expect(page.getByLabel('Speech pace',{exact:true})).toHaveValue('1.15');
});

test('a failed explicit Preferences choice reports failure without creating a remembered value',async({page})=>{
  await ready(page,'/app#memory');
  await page.evaluate(()=>{const write=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.endsWith('nox.approved-preferences.v1'))throw new DOMException('Synthetic storage full','QuotaExceededError');return write.call(this,key,value);};});
  await page.getByRole('button',{name:'Shorter answers',exact:true}).click();
  await expect(page.locator('.memory-content .release-notice')).toContainText(/could not.*applied/i);
  expect(await page.evaluate(()=>settingsPreferences.context().answerLength)).toBeUndefined();
  await expect(page.locator('.preference-row')).toHaveCount(0);
  expect(await page.evaluate(()=>settingsProposalCount)).toBe(0);
});

test('editing the general pace in a learning conversation keeps its activity override intact',async({page})=>{
  await ready(page,'/guest#learn');
  await page.evaluate(async()=>{await settingsPreferences.approve(settingsPreferences.propose('Speak at 0.85x','general'));await settingsPreferences.approve(settingsPreferences.propose('Speak at 0.75x','learning'));});
  await page.getByLabel('An idea or passage',{exact:true}).fill('CI scoped learning pace');
  const learning=page.waitForRequest(request=>request.url().endsWith('/api/chat'));
  await page.getByRole('button',{name:'Explore with NOX',exact:true}).click();
  expect((await learning).postDataJSON().context.preferences.speechPace).toBe(.75);
  await page.locator('#settings-button').click();
  const pace=page.getByLabel('Speech pace',{exact:true});await expect(pace).toHaveValue('0.85');
  await pace.selectOption('0.75');await expect.poll(()=>page.evaluate(()=>settingsPreferences.context().speechPace)).toBe(.75);
  await pace.selectOption('1.15');await expect(pace).toHaveValue('1.15');
  expect(await page.evaluate(()=>settingsPreferences.context('learning').speechPace)).toBe(.75);
  await page.locator('#close-inside').click();
  const next=page.waitForRequest(request=>request.url().endsWith('/api/chat'));
  await page.locator('#message').fill('CI keep the learning override');await page.locator('#send-button').click();
  expect((await next).postDataJSON().context.preferences.speechPace).toBe(.75);
});
