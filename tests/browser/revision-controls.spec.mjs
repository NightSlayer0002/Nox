import {test,expect} from '@playwright/test';

const archive={version:1,active:'revision',threads:[{id:'revision',title:'First question',mode:'companion',turns:[
  {role:'user',content:'First question',seq:1},{role:'assistant',content:'First answer',seq:2},
  {role:'user',content:'Later question',seq:3},{role:'assistant',content:'Later answer',seq:4},
]}]};
async function open(page){
  await page.addInitScript(archive=>localStorage.setItem('nox.chats.v1',JSON.stringify(archive)),archive);
  await page.goto('/app#conversation');await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
}
test('editing remains explicit through clear/retype and Cancel or Escape restores the earlier draft',async({page})=>{
  // Question: Are the persistent editing state, scope and cancellation controls usable on the real page?
  // Limits: Desktop Chromium fixture; no screen-reader, other-browser, or long-term storage guarantee.
  await open(page);const input=page.locator('#message'),first=page.locator('#conversation .message.user').first();
  await input.fill('An earlier unfinished thought');await first.getByRole('button',{name:'Edit your message',exact:true}).focus();await page.keyboard.press('Enter');
  const controls=page.getByRole('group',{name:'Message revision'});await expect(controls).toContainText('3 messages');await expect(controls.getByRole('button',{name:'Cancel edit'})).toBeVisible();
  await input.fill('');await input.fill('A correction in progress');await first.getByRole('button',{name:'Edit your message',exact:true}).click();await expect(input).toHaveValue('A correction in progress');
  await input.press('Escape');await expect(input).toHaveValue('An earlier unfinished thought');await expect(controls).toBeHidden();
  await first.getByRole('button',{name:'Edit your message',exact:true}).click();await controls.getByRole('button',{name:'Cancel edit'}).click();await expect(input).toHaveValue('An earlier unfinished thought');
});

test('an older Retry waits for a counted inline confirmation and a stale confirmation leaves saved work intact',async({page})=>{
  // Question: Does the actual Retry route preserve the captured revision until deliberate confirmation?
  // Limits: Synthetic provider and same-page injected write; not native cross-tab scheduling or provider quality.
  await open(page);let requests=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/api/chat')requests++;});
  const retry=page.locator('#conversation .message.nox').first().getByRole('button',{name:'Retry NOX’s reply',exact:true});
  const original=await page.evaluate(()=>localStorage.getItem('nox.chats.v1'));await retry.click();const controls=page.getByRole('group',{name:'Message revision'});
  await expect(controls).toContainText('2 messages');expect(requests).toBe(0);expect(await page.evaluate(()=>localStorage.getItem('nox.chats.v1'))).toBe(original);
  await controls.getByRole('button',{name:'Keep conversation'}).click();expect(requests).toBe(0);
  await retry.click();const changed=await page.evaluate(()=>{const value=JSON.parse(localStorage.getItem('nox.chats.v1'));value.threads[0].turns[0].content='A newer correction';const raw=JSON.stringify(value);localStorage.setItem('nox.chats.v1',raw);return raw;});
  await controls.getByRole('button',{name:'Replace and retry'}).click();await expect(page.locator('#toast')).toContainText('changed');expect(requests).toBe(0);expect(await page.evaluate(()=>localStorage.getItem('nox.chats.v1'))).toBe(changed);
});

test('confirmed older Retry preserves the composer draft and latest Retry needs no confirmation',async({page})=>{
  // Question: Does the complete Retry interaction have the announced scope without adding routine friction?
  // Limits: Mobile-sized Chromium with synthetic chat; not physical mobile input, audio, or other browsers.
  await page.setViewportSize({width:430,height:900});let requests=0;
  await page.route('**/api/chat',route=>{requests++;return route.fulfill({contentType:'application/json',body:JSON.stringify({speech:'Retried answer.',emotion:'curious',action:'none',memory:''})});});
  await open(page);await page.locator('#message').fill('An independent draft');
  await page.locator('#conversation .message.nox').first().getByRole('button',{name:'Retry NOX’s reply',exact:true}).click();
  const controls=page.getByRole('group',{name:'Message revision'});await expect(controls).toBeVisible();expect(requests).toBe(0);
  expect(await controls.evaluate(node=>node.scrollWidth-node.clientWidth)).toBeLessThan(2);
  await page.screenshot({path:'artifacts/audit-c05-revision-mobile.png'});await controls.getByRole('button',{name:'Replace and retry'}).click();
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveText(/Retried answer/);await expect(page.locator('#conversation .message.user')).toHaveText(/First question/);
  await expect(page.locator('#message')).toHaveValue('An independent draft');expect(requests).toBe(1);
  await page.locator('#conversation .message.nox').last().getByRole('button',{name:'Retry NOX’s reply',exact:true}).click();
  await expect.poll(()=>requests).toBe(2);await expect(controls).toBeHidden();await expect(page.locator('#message')).toHaveValue('An independent draft');
});
