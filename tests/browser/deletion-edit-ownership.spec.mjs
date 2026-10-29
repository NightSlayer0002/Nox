import {test,expect} from '@playwright/test';

const archive={version:1,active:'alpha',threads:[
  {id:'alpha',title:'Alpha question',mode:'companion',turns:[{role:'user',content:'Alpha question',seq:1},{role:'assistant',content:'Alpha answer',seq:2}]},
  {id:'beta',title:'Beta question',mode:'companion',turns:[{role:'user',content:'Beta private context',seq:1},{role:'assistant',content:'Beta answer',seq:2}]},
]};
async function openEdit(page){
  await page.addInitScript(archive=>{if(!localStorage.getItem('nox.chats.v1'))localStorage.setItem('nox.chats.v1',JSON.stringify(archive));},archive);
  await page.goto('/app#conversation');await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
  await page.locator('#message').fill('Earlier independent draft');await page.locator('#conversation .message.user').getByRole('button',{name:'Edit your message',exact:true}).click();await page.locator('#message').fill('Unsent Alpha correction');
}

test('deletion cannot change chat ownership while its edit is unresolved',async({page})=>{
  // Question: Do store ID, visible transcript, edit scope and next-request context remain consistent through refused and successful deletion?
  // Limits: Real Chromium app with synthetic inference; not other users' data, physical-device input or all external-tab event orderings.
  const requests=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/api/chat')requests.push(r.postDataJSON());});await openEdit(page);
  await page.evaluate(()=>location.hash='#library');const alpha=page.locator('.history-item').filter({hasText:'Alpha question'});
  await alpha.getByRole('button',{name:'Delete Alpha question',exact:true}).click();await alpha.getByRole('button',{name:'Delete conversation',exact:true}).click();
  await expect(alpha.getByRole('alert')).toContainText(/finish|cancel/i);await expect(page.locator('#history-list .history-item')).toHaveCount(2);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nox.chats.v1')).active)).toBe('alpha');
  await alpha.getByRole('button',{name:'Keep',exact:true}).click();await page.evaluate(()=>location.hash='#conversation');
  await expect(page.locator('#conversation .message.user .message-content')).toHaveText('Alpha question');await expect(page.locator('#message')).toHaveValue('Unsent Alpha correction');
  await page.getByRole('button',{name:'Cancel edit',exact:true}).click();await expect(page.locator('#message')).toHaveValue('Earlier independent draft');
  await page.evaluate(()=>location.hash='#library');await alpha.getByRole('button',{name:'Delete Alpha question',exact:true}).click();await alpha.getByRole('button',{name:'Delete conversation',exact:true}).click();
  await expect(page.locator('#history-list .history-item')).toHaveCount(1);await page.evaluate(()=>location.hash='#conversation');
  await expect(page.locator('#conversation .message.user .message-content')).toHaveText('Beta private context');await expect(page.locator('#chat-title')).toHaveText('Beta question');
  await page.locator('#message').fill('Continue the visible conversation');await page.locator('#send-button').click();await expect.poll(()=>requests.length).toBe(1);
  expect(requests[0].context.history).toEqual([{role:'user',content:'Beta private context'},{role:'assistant',content:'Beta answer'}]);
});

test('deleting inactive history preserves the visible edit and its earlier draft',async({page})=>{
  // Question: Does deleting an unrelated conversation leave the active edit usable without a mandatory navigation guard?
  // Limits: One Chromium deletion flow with local persistence; no claim of global draft autosave or cloud sync.
  await openEdit(page);await page.evaluate(()=>location.hash='#library');const beta=page.locator('.history-item').filter({hasText:'Beta question'});
  await beta.getByRole('button',{name:'Delete Beta question',exact:true}).click();await beta.getByRole('button',{name:'Delete conversation',exact:true}).click();await expect(page.locator('#history-list .history-item')).toHaveCount(1);
  await page.evaluate(()=>location.hash='#conversation');await expect(page.locator('#message')).toHaveValue('Unsent Alpha correction');await expect(page.getByRole('group',{name:'Message revision'})).toBeVisible();
  await page.getByRole('button',{name:'Cancel edit',exact:true}).click();await expect(page.locator('#message')).toHaveValue('Earlier independent draft');
});
