import {test,expect} from '@playwright/test';

for(const width of [390,1440])test(`character controls remain usable at ${width}px`,async({page,context})=>{
  // Question: do the new symbols, dismissal and Hide/Show survive real layout?
  // Limits: Chromium with Canvas fallback; anatomical GPU preview, physical FPS
  // and native touch ergonomics are not established by this journey.
  await page.setViewportSize({width,height:900});await page.goto('/guest#conversation');
  await expect(page.locator('body')).toHaveAttribute('data-floating','true');
  await page.locator('#presence-menu > summary').click();
  const panel=page.locator('#presence-menu-panel');await expect(panel).toBeVisible();
  const rect=await panel.boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(width);
  await expect(panel.locator('[data-form=face] img')).toHaveAttribute('src','/assets/nox/presence.svg');
  await expect(panel.locator('[data-form=core] img')).toHaveAttribute('src',/signal.svg|data:image/);
  await panel.locator('[data-form=core]').click();await expect(panel).toBeHidden();
  await page.screenshot({path:`artifacts/oct31-signal-${width}.png`});
  await page.locator('#presence-menu > summary').click();await panel.getByRole('button',{name:'Hide NOX',exact:true}).click();
  await expect(page.locator('.floating-ui')).toBeHidden();await expect(page.locator('#presence-toggle')).toBeFocused();
  await page.getByRole('button',{name:'Show NOX',exact:true}).click();await expect(page.locator('.floating-ui')).toBeVisible();
  await context.setOffline(true);await expect(page.locator('.nox-network-status')).toContainText('Offline');
  await context.setOffline(false);await expect(page.locator('.nox-network-status')).toBeHidden();
});

test('message exploration uses a cross and Afterimage keeps playback ahead of the cue list',async({page})=>{
  // Question: are the revised message menu and direct story controls operable?
  // Limits: synthetic model replies, no speech quality or native codec claim.
  await page.goto('/guest#conversation');await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await page.locator('#message').fill('CI visual exploration');await page.locator('#send-button').click();
  const message=page.locator('#conversation .message.nox:not(.draft)').last();await expect(message).toContainText('Synthetic answer');
  await message.getByRole('button',{name:'Explore this message with NOX',exact:true}).click();
  const close=page.getByRole('button',{name:'Close message actions',exact:true});await expect(close).toHaveText('');await expect(close.locator('.message-dismiss-cross')).toBeVisible();
  await page.screenshot({path:'artifacts/oct31-message-menu.png'});await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.screenshot({path:'artifacts/oct31-message-menu-light.png'});await page.evaluate(()=>document.documentElement.dataset.theme='dark');await close.click();await expect(close).toBeHidden();
  await page.evaluate(()=>location.hash='#afterimage');await expect(page.getByRole('button',{name:'Play this cut',exact:true})).toBeEnabled();
  expect(await page.locator('.performance-actions').evaluate(node=>Boolean(node.compareDocumentPosition(document.querySelector('.cue-tape'))&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.screenshot({path:'artifacts/oct31-afterimage-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/oct31-afterimage-mobile.png'});
});
