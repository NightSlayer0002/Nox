import {test,expect} from '@playwright/test';

test('a rejected owner deletion stays visible and saved until a successful retry survives reload',async({page})=>{
  await page.addInitScript(()=>{
    if(!localStorage.getItem('nox.chats.v1'))localStorage.setItem('nox.chats.v1',JSON.stringify({version:1,active:'alpha',threads:[
      {id:'alpha',title:'Saved alpha',updated:1,mode:'companion',turns:[{role:'user',content:'Keep alpha until deletion succeeds',seq:1}]},
      {id:'beta',title:'Saved beta',updated:2,mode:'companion',turns:[{role:'user',content:'Keep beta too',seq:1}]},
    ]}));
    const original=Storage.prototype.setItem;window.rejectHistoryWrites=false;
    Storage.prototype.setItem=function(key,value){if(this===localStorage&&key==='nox.chats.v1'&&window.rejectHistoryWrites)throw new DOMException('Synthetic blocked storage','QuotaExceededError');return original.call(this,key,value);};
  });
  await page.goto('/app#library');await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
  const rows=page.locator('#history-list .history-item'),alpha=rows.filter({hasText:'Saved alpha'});
  await expect(rows).toHaveCount(2);const saved=await page.evaluate(()=>localStorage.getItem('nox.chats.v1'));
  await page.evaluate(()=>{window.rejectHistoryWrites=true;});
  await alpha.getByRole('button',{name:'Delete Saved alpha',exact:true}).click();
  await alpha.getByRole('button',{name:'Delete conversation',exact:true}).click();
  await expect(alpha.getByRole('alert')).toContainText('not removed');await expect(rows).toHaveCount(2);
  await expect(alpha.getByRole('button',{name:'Delete conversation',exact:true})).toBeEnabled();await expect(alpha.getByRole('button',{name:'Keep',exact:true})).toBeEnabled();
  expect(await page.evaluate(()=>localStorage.getItem('nox.chats.v1'))).toBe(saved);
  await page.screenshot({path:'artifacts/audit-deletion-rejected.png'});
  await page.reload();await expect(rows).toHaveCount(2);
  await alpha.getByRole('button',{name:'Delete Saved alpha',exact:true}).click();await alpha.getByRole('button',{name:'Delete conversation',exact:true}).click();
  await expect(rows).toHaveCount(1);await expect(rows).toContainText('Saved beta');
  await page.reload();await expect(rows).toHaveCount(1);await expect(rows).toContainText('Saved beta');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nox.chats.v1')).active)).toBe('beta');
});
