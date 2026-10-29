import {test,expect} from '@playwright/test';

for(const width of [320,390,768,900])test(`a second conversation has a visible tap path at ${width}px`,async({page})=>{
  // Question: Can a person start another chat after the empty state disappears, without a hidden sidebar or keyboard shortcut?
  // Limits: Chromium viewport and pointer input, synthetic inference; not a physical keyboard, assistive technology or all mobile browsers.
  await page.setViewportSize({width,height:900});await page.goto('/guest#conversation');await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await page.locator('#message').fill('My first conversation');await page.locator('#send-button').click();await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(1);
  await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('link',{name:'Chats',exact:true}).click();
  const start=page.getByRole('button',{name:'New conversation',exact:true});await expect(start).toBeVisible();
  expect(await start.evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})).toBe(true);
  await start.click();await expect(page.locator('#conversation .message')).toHaveCount(0);await expect(page.locator('#conversation-welcome')).toBeVisible();
  await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('link',{name:'Chats',exact:true}).click();await expect(page.locator('#history-list .history-item')).toHaveCount(1);await expect(start).toBeVisible();
});
