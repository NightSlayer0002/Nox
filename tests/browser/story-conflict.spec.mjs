import {test,expect} from '@playwright/test';
import {FIRST_CONTACT} from '../../client/afterimage-example.js';

test('two owner tabs cannot silently apply an old draft to a changed story branch',async({page,context})=>{
  await page.goto('/app#conversation');await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
  const id=await page.evaluate(async packet=>{
    const {createAfterimageStore}=await import('/js/afterimage-store.js');
    return (await createAfterimageStore(localStorage).add({packet,seed:'Synthetic conflict',tone:'uncanny',source:'authored'})).id;
  },FIRST_CONTACT);
  await page.goto('/app#afterimage');
  await page.getByRole('button',{name:'Edit this cut',exact:true}).click();
  const firstLine=page.locator('.cut-editor textarea').first();await firstLine.fill('My draft belongs to the original branch.');
  const other=await context.newPage();await other.goto('/app#afterimage');
  const changed=await other.evaluate(async id=>{
    const {createAfterimageStore}=await import('/js/afterimage-store.js');const store=createAfterimageStore(localStorage);
    const cut=store.get(id);return store.update(id,{signalIndex:1},{expectedRevision:cut.revision});
  },id);
  await page.getByRole('button',{name:'Apply edits',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('another tab');
  await expect(firstLine).toHaveValue('My draft belongs to the original branch.');
  await expect(page.getByRole('button',{name:'Apply edits',exact:true})).toBeDisabled();
  expect(await other.evaluate(()=>JSON.parse(localStorage.getItem('nox.afterimage.v1')).receptions[0])).toEqual(changed);
  await page.getByRole('button',{name:'Review saved cut',exact:true}).click();
  await expect(page.getByRole('group',{name:'Choose a branch'}).getByRole('button').nth(1)).toHaveAttribute('aria-pressed','true');
  await expect(firstLine).toHaveValue('My draft belongs to the original branch.');
  await page.getByRole('button',{name:'Apply edits',exact:true}).click();
  await expect(page.locator('.cut-editor')).toBeHidden();
  const saved=await other.evaluate(()=>JSON.parse(localStorage.getItem('nox.afterimage.v1')).receptions[0]);
  expect(saved.signalIndex).toBe(1);expect(saved.editedLines[0]).toBe('My draft belongs to the original branch.');
});
