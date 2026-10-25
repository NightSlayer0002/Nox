import {test,expect} from '@playwright/test';

test('a guest can paste an unnamed note and use its derived source title in chat',async({page})=>{
  await page.goto('/guest#conversation');await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await page.locator('#knowledge-button').click();
  await page.getByLabel('Source text',{exact:true}).fill('Aurora observatory hours\nThe Aurora observatory opens at six.');
  await page.getByLabel('Use relevant notes in chat').check();
  await page.getByRole('button',{name:'Add for this visit',exact:true}).click();
  await expect(page.locator('.knowledge-row')).toContainText('Aurora observatory hours');
  await expect(page.getByLabel('Note title (optional)',{exact:true})).toHaveValue('');
  await page.keyboard.press('Escape');
  await page.locator('#message').fill('When does the Aurora observatory open?');
  const sent=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/chat');
  await page.locator('#send-button').click();
  const body=(await sent).postDataJSON();
  expect(body.context.knowledge).toEqual(expect.arrayContaining([expect.objectContaining({title:'Aurora observatory hours',text:expect.stringContaining('opens at six')})]));
});
