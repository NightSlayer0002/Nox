import {test,expect} from '@playwright/test';

test('an owner can explicitly turn off unavailable notebook context and continue the same question',async({page})=>{
  // Question: does unavailable note storage preserve the draft and offer an explicit way to continue without notes?
  // Limits: real UI with a controlled IndexedDB denial and synthetic AI, not device permission settings or live inference.
  await page.addInitScript(()=>{indexedDB.open=()=>{throw Error('Notebook storage is blocked.');};});
  const requests=[];
  page.on('request',request=>{if(new URL(request.url()).pathname==='/api/chat')requests.push(request.postDataJSON());});
  await page.goto('/app#conversation');
  await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
  await page.locator('#message').fill('Keep this question while I choose what to share.');
  await page.locator('#send-button').click();
  await expect(page.locator('#send-button')).toBeEnabled();
  await expect(page.locator('#message')).toHaveValue('Keep this question while I choose what to share.');
  expect(requests).toHaveLength(0);
  await page.getByRole('button',{name:'Open command palette'}).click();
  await page.getByRole('button',{name:'Knowledge notebook Add text for NOX to work with'}).click();
  await page.getByLabel('Use relevant notes in chat').uncheck();
  await expect(page.getByRole('status').filter({hasText:'Notebook context disabled for this visit.'})).toBeVisible();
  await page.getByRole('button',{name:'Close Notes for this visit'}).click();
  await page.locator('#send-button').click();
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(1);
  expect(requests).toHaveLength(1);
  expect(requests[0].context.knowledge).toBeUndefined();
});
