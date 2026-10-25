import {test,expect} from '@playwright/test';
import {FIRST_CONTACT} from '../../client/afterimage-example.js';

async function holdLock(page,name){
  await page.evaluate(name=>new Promise(resolve=>{
    window.pendingSaveLock=navigator.locks.request(name,()=>new Promise(release=>{
      window.releaseSaveLock=release;resolve();
    }));
  }),name);
}
async function releaseLock(page){await page.evaluate(async()=>{window.releaseSaveLock();await window.pendingSaveLock;});}

test('a completed notebook save preserves newer text typed while its storage lock was pending',async({page})=>{
  await page.goto('/app#conversation');await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
  await page.getByRole('button',{name:'Open command palette'}).click();
  await page.getByRole('button',{name:'Knowledge notebook Add text for NOX to work with'}).click();
  await page.getByLabel('Note title',{exact:true}).fill('Draft A');
  await page.getByLabel('Source text',{exact:true}).fill('The original note body.');
  await holdLock(page,'nox.knowledge.write');
  await page.getByRole('button',{name:'Save note',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save note',exact:true})).toBeDisabled();
  await expect(page.getByLabel('Use relevant notes in chat')).toBeDisabled();
  await expect(page.locator('#knowledge-file')).toBeDisabled();
  await page.getByLabel('Note title',{exact:true}).fill('Draft B');
  await page.getByLabel('Source text',{exact:true}).fill('Newer unsaved work.');
  await releaseLock(page);
  await expect(page.locator('.knowledge-row')).toHaveCount(1);
  await expect(page.locator('.knowledge-row')).toContainText('The original note body.');
  await expect(page.getByLabel('Note title',{exact:true})).toHaveValue('Draft B');
  await expect(page.getByLabel('Source text',{exact:true})).toHaveValue('Newer unsaved work.');
  await page.getByRole('button',{name:'Save note',exact:true}).click();
  await expect(page.locator('.knowledge-row')).toHaveCount(2);
  await expect(page.getByLabel('Source text',{exact:true})).toHaveValue('');
});

test('reentrant notebook submission commits the submitted note only once',async({page})=>{
  await page.goto('/app#conversation');await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
  await page.getByRole('button',{name:'Open command palette'}).click();
  await page.getByRole('button',{name:'Knowledge notebook Add text for NOX to work with'}).click();
  await page.getByLabel('Note title',{exact:true}).fill('Submit once');
  await page.getByLabel('Source text',{exact:true}).fill('One saved copy.');
  await holdLock(page,'nox.knowledge.write');
  await page.locator('#knowledge-title').evaluate(node=>{node.form.requestSubmit();node.form.requestSubmit();});
  await expect.poll(()=>page.evaluate(async()=>(await navigator.locks.query()).pending.filter(lock=>lock.name==='nox.knowledge.write').length)).toBe(1);
  await releaseLock(page);
  await expect(page.locator('.knowledge-row')).toHaveCount(1);
});

test('a slow file import reserves the notebook mutation before reading the file',async({page})=>{
  await page.goto('/app#conversation');await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
  await page.getByRole('button',{name:'Open command palette'}).click();
  await page.getByRole('button',{name:'Knowledge notebook Add text for NOX to work with'}).click();
  await page.getByLabel('Note title',{exact:true}).fill('An unfinished draft');
  await page.getByLabel('Source text',{exact:true}).fill('Keep this draft available.');
  await page.evaluate(()=>{File.prototype.text=function(){return new Promise(resolve=>{window.finishImportRead=()=>resolve('The imported file contents.');});};});
  await page.locator('#knowledge-file').setInputFiles({name:'slow-note.txt',mimeType:'text/plain',buffer:Buffer.from('The imported file contents.')});
  await expect(page.getByRole('button',{name:'Save note',exact:true})).toBeDisabled();
  await page.locator('#knowledge-title').evaluate(node=>node.form.requestSubmit());
  await page.evaluate(()=>window.finishImportRead());
  await expect(page.locator('.knowledge-row')).toHaveCount(1);
  await expect(page.locator('.knowledge-row')).toContainText('slow-note.txt');
  await expect(page.getByLabel('Note title',{exact:true})).toHaveValue('An unfinished draft');
  await expect(page.getByLabel('Source text',{exact:true})).toHaveValue('Keep this draft available.');
  await expect(page.locator('#knowledge-file')).toBeEnabled();
});

test('applying an older story edit keeps newer lines open until they are explicitly applied',async({page})=>{
  await page.goto('/app#conversation');await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
  await page.evaluate(async packet=>{
    const {createAfterimageStore}=await import('/js/afterimage-store.js');
    await createAfterimageStore(localStorage).add({packet,seed:'A synthetic door',tone:'wonder',source:'authored'});
  },FIRST_CONTACT);
  await page.goto('/app#afterimage');
  await page.getByRole('button',{name:'Edit this cut',exact:true}).click();
  const firstLine=page.locator('.cut-editor textarea').first();
  await firstLine.fill('The first edit is ready to save.');
  await holdLock(page,'nox.afterimage.write');
  await page.getByRole('button',{name:'Apply edits',exact:true}).click();
  await expect(page.getByRole('button',{name:'Apply edits',exact:true})).toBeDisabled();
  await firstLine.fill('This newer edit must remain open.');
  await releaseLock(page);
  await expect(page.locator('.cue-tape li').first()).toContainText('The first edit is ready to save.');
  await expect(firstLine).toBeVisible();
  await expect(firstLine).toHaveValue('This newer edit must remain open.');
  await page.getByRole('button',{name:'Apply edits',exact:true}).click();
  await expect(page.locator('.cue-tape li').first()).toContainText('This newer edit must remain open.');
  await expect(page.locator('.cut-editor')).toBeHidden();
});
