import {test,expect} from '@playwright/test';

async function pair(page,context){
  await page.addInitScript(()=>{if(!localStorage.getItem('nox.chats.v1'))localStorage.setItem('nox.chats.v1',JSON.stringify({version:1,active:'alpha',threads:[{id:'alpha',title:'Alpha',mode:'companion',turns:[{seq:1,role:'user',content:'Alpha question'},{seq:2,role:'assistant',content:'Alpha answer'}]},{id:'beta',title:'Beta',mode:'companion',turns:[{seq:1,role:'user',content:'Beta must survive'}]}]}));});
  await page.goto('/app#conversation');await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
  const second=await context.newPage();await second.goto('/app#conversation');await expect(second.locator('#brain-status')).toContainText('Synthetic CI provider');return second;
}
async function edit(page,text){const message=page.locator('#conversation .message.user').first();await message.hover();await message.getByRole('button',{name:'Edit your message',exact:true}).click();await page.locator('#message').fill(text);}

test('a stale edit preserves a newer correction from another real tab',async({page,context})=>{
  const second=await pair(page,context),requests=[];page.on('request',request=>{if(new URL(request.url()).pathname==='/api/chat')requests.push(request);});
  await edit(page,'Stale Alpha correction');await edit(second,'Newer Alpha correction');await second.locator('#send-button').click();
  await expect(second.locator('#conversation .message.nox:not(.draft)')).toContainText('Newer Alpha correction');
  await expect(page.locator('#conversation .message.user')).toContainText('Newer Alpha correction');
  await page.locator('#send-button').click();await expect(page.locator('#toast')).toContainText('changed in another tab');
  await expect(page.locator('#message')).toHaveValue('Stale Alpha correction');expect(requests).toHaveLength(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nox.chats.v1')).threads.find(t=>t.id==='alpha').turns.map(t=>t.content))).toEqual(['Newer Alpha correction','Synthetic answer to: Newer Alpha correction']);
});
test('deletion in another tab cannot redirect an open edit to Beta',async({page,context})=>{
  const second=await pair(page,context),requests=[];page.on('request',request=>{if(new URL(request.url()).pathname==='/api/chat')requests.push(request);});
  await edit(page,'A correction intended for Alpha');
  await second.evaluate(async()=>{const {createHistory}=await import('/js/history.js');const history=await createHistory(localStorage);await history.remove('alpha');history.dispose();});
  await expect(page.locator('#conversation .message.user')).toContainText('Beta must survive');
  await page.locator('#send-button').click();await expect(page.locator('#toast')).toContainText('changed in another tab');
  await expect(page.locator('#message')).toHaveValue('A correction intended for Alpha');expect(requests).toHaveLength(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nox.chats.v1')).threads.map(t=>({id:t.id,text:t.turns.map(t=>t.content)})))).toEqual([{id:'beta',text:['Beta must survive']}]);
});
test('Retry queued before a second-tab append cannot discard its new turns',async({page,context})=>{
  await page.addInitScript(()=>{window.holdChatEvents=false;window.addEventListener('storage',event=>{if(window.holdChatEvents&&event.key==='nox.chats.v1')event.stopImmediatePropagation();},{capture:true});});
  const second=await pair(page,context),requests=[];page.on('request',request=>{if(new URL(request.url()).pathname==='/api/chat')requests.push(request);});
  await page.evaluate(()=>{window.holdChatEvents=true;const request=navigator.locks.request.bind(navigator.locks);let hold=true;window.revisionWaiting=false;navigator.locks.request=(name,callback)=>{if(name==='nox.chat-history.write'&&hold){hold=false;window.revisionWaiting=true;return new Promise(resolve=>{window.releaseRevision=()=>resolve(request(name,callback));});}return request(name,callback);};});
  const reply=page.locator('#conversation .message.nox');await reply.hover();await reply.getByRole('button',{name:'Retry NOX’s reply',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>revisionWaiting)).toBe(true);
  await second.locator('#message').fill('A newer question');await second.locator('#send-button').click();
  await expect(second.locator('#conversation .message.nox:not(.draft)')).toHaveCount(2);
  await expect(page.locator('#conversation .message')).toHaveCount(2);
  await page.evaluate(()=>releaseRevision());await expect(page.locator('#conversation .message')).toHaveCount(4);
  await page.evaluate(()=>{window.holdChatEvents=false;window.dispatchEvent(new StorageEvent('storage',{key:'nox.chats.v1',storageArea:localStorage}));});
  expect(requests).toHaveLength(0);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nox.chats.v1')).threads.find(t=>t.id==='alpha').turns.map(t=>t.content))).toEqual(['Alpha question','Alpha answer','A newer question','Synthetic answer to: A newer question']);
});
