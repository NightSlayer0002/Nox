import {test,expect} from '@playwright/test';

test('film controls work without advertising removed letter shortcuts',async({page})=>{
  // Question: Does the actual film-mode interface expose working buttons whose labels match its retained keyboard behavior?
  // Limits: Chromium pointer/keyboard and Canvas fallback; not actual recording, WebGL, assistive technology or every shortcut context.
  await page.goto('/guest#scenes');await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await page.locator('#film-button').click();await expect(page.locator('body')).toHaveClass(/film/);await expect(page.locator('#exit-film')).toHaveText('Exit film mode');
  await page.locator('#exit-film').focus();await page.keyboard.press('f');await expect(page.locator('body')).toHaveClass(/film/);
  await page.locator('#exit-film').click();await expect(page.locator('body')).not.toHaveClass(/film/);await expect(page.locator('#film-button')).toBeVisible();await expect(page.locator('#record-button')).toBeVisible();
  await expect(page.locator('footer')).not.toContainText(/F for film|· F\b|\(F\)|\(R\)/i);
});
