import {test,expect} from '@playwright/test';

for(const [width,height] of [[1188,650],[1188,720],[1188,900],[1268,720],[1200,720],[1000,720],[900,720],[390,720]])test(`Afterimage playback controls receive pointer clicks at ${width} × ${height}`,async({page})=>{
  await page.setViewportSize({width,height});
  await page.goto('/guest#afterimage');
  const example=page.getByRole('button',{name:'Play example',exact:true});
  await expect(example).toBeEnabled();
  await example.click({timeout:5000});
  await expect(page.locator('.receiver-state')).toContainText('Playing');
  const stop=width<=1200?page.getByRole('button',{name:'Stop performance',exact:true}):page.locator('.performance-actions').getByRole('button',{name:'Stop',exact:true});
  await stop.click({timeout:5000});
  const cut=page.getByRole('button',{name:'Play this cut',exact:true});
  await expect(cut).toBeEnabled();
  await cut.click({timeout:5000});
  await expect(page.locator('.receiver-state')).toContainText('Playing');
});
