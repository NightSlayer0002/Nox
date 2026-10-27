import {test,expect} from '@playwright/test';

for(const operation of ['edit','retry'])test(`owner ${operation} retains the transcript and draft on rejected storage, then persists a retry`,async({page})=>{
  await page.addInitScript(()=>{
    if(!localStorage.getItem('nox.chats.v1'))localStorage.setItem('nox.chats.v1',JSON.stringify({version:1,active:'fixture',threads:[{id:'fixture',title:'Original question',updated:1,mode:'companion',turns:[
      {role:'user',content:'Original question',seq:1},{role:'assistant',content:'Original answer',seq:2},
      {role:'user',content:'Later question',seq:3},{role:'assistant',content:'Later answer',seq:4},
    ]}]}));
    const write=Storage.prototype.setItem;window.rejectRevision=false;
    Storage.prototype.setItem=function(key,value){if(this===localStorage&&key==='nox.chats.v1'&&window.rejectRevision)throw new DOMException('Synthetic rejected revision','QuotaExceededError');return write.call(this,key,value);};
  });
  const requests=[];page.on('request',request=>{if(new URL(request.url()).pathname==='/api/chat')requests.push(request);});
  await page.goto('/app#conversation');await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
  const input=page.locator('#message'),messages=page.locator('#conversation .message');await expect(messages).toHaveCount(4);
  const saved=await page.evaluate(()=>localStorage.getItem('nox.chats.v1'));
  await page.evaluate(()=>{window.rejectRevision=true;});
  if(operation==='edit'){
    const first=page.locator('#conversation .message.user').first();await first.hover();await first.getByRole('button',{name:'Edit your message',exact:true}).click();
    await input.fill('My corrected question');await page.locator('#send-button').click();
  }else{
    await input.fill('Keep this unrelated draft');const first=page.locator('#conversation .message.nox').first();await first.hover();await first.getByRole('button',{name:'Retry NOX’s reply',exact:true}).click();
  }
  await expect(page.locator('#toast')).toContainText('conversation was not changed');await expect(messages).toHaveCount(4);
  await expect(input).toHaveValue(operation==='edit'?'My corrected question':'Keep this unrelated draft');
  expect(requests).toHaveLength(0);expect(await page.evaluate(()=>localStorage.getItem('nox.chats.v1'))).toBe(saved);
  await page.evaluate(()=>{window.rejectRevision=false;});
  if(operation==='edit')await page.locator('#send-button').click();
  else{const first=page.locator('#conversation .message.nox').first();await first.hover();await first.getByRole('button',{name:'Retry NOX’s reply',exact:true}).click();}
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(1);
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toContainText(operation==='edit'?'My corrected question':'Original question');
  await expect(page.locator('#conversation .message.user')).toHaveCount(1);expect(requests).toHaveLength(1);
  await expect(input).toHaveValue(operation==='edit'?'':'Keep this unrelated draft');
  await page.reload();await expect(messages).toHaveCount(2);await expect(messages).toContainText([operation==='edit'?'My corrected question':'Original question',operation==='edit'?'My corrected question':'Original question']);
});
