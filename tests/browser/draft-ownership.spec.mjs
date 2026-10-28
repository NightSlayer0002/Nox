import {test,expect} from '@playwright/test';

// Evidence boundary: real Chromium, synthetic chat replies, temporary visit.
// These cases resolve composer ownership, not provider intelligence or device persistence.
test('a connected activity handoff retains the separate chat draft',async({page})=>{
  await page.goto('/guest#conversation');await expect(page.locator('#brain-status')).toContainText('Guest visit');
  const input=page.locator('#message'),draft='An unfinished chat idea';await input.fill(draft);
  await page.evaluate(()=>location.hash='#learn');
  await page.getByLabel('An idea or passage',{exact:true}).fill('The Moon reflects sunlight.');
  await page.getByRole('button',{name:'Explore with NOX',exact:true}).click();
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toContainText('The Moon reflects sunlight.');
  await expect(input).toHaveValue(draft);
  await input.press('Enter');await expect(page.locator('#conversation .message.nox:not(.draft)').last()).toContainText(draft);
  await expect(input).toHaveValue('');
});
