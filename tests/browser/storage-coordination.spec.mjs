import {test,expect} from '@playwright/test';

// Real page startup with a deliberately missing capability. These cases do not
// test native Web Locks correctness, other browsers or physical disk durability.
const archive={version:1,active:'fixture',threads:[{id:'fixture',title:'Saved question',mode:'companion',turns:[{role:'user',content:'Saved question',seq:1},{role:'assistant',content:'Saved answer',seq:2}]}]};
for(const scope of ['app','guest'])test(`${scope} startup without Web Locks preserves owner bytes and exposes the correct write scope`,async({page})=>{
  // Uncertainty: can the capability gate leave startup blank or block isolated guests?
  await page.addInitScript(archive=>{
    Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});
    window.originalArchive=JSON.stringify(archive);localStorage.setItem('nox.chats.v1',originalArchive);
  },archive);
  await page.goto(`/${scope}#conversation`);await expect(page.locator('#brain-status')).toContainText(scope==='app'?'Synthetic CI provider':'Guest visit');
  if(scope==='app'){
    await expect(page.locator('#conversation .message')).toHaveCount(2);await expect(page.locator('#conversation-privacy')).toContainText('read-only');
    await page.locator('#message').fill('A blocked private append');await page.locator('#send-button').click();
    await expect(page.locator('#toast')).toContainText('Web Locks');await expect(page.locator('#message')).toHaveValue('A blocked private append');
    await expect(page.locator('#conversation .message')).toHaveCount(2);
  }else{
    await expect(page.locator('#conversation .message')).toHaveCount(0);await page.locator('#message').fill('A temporary guest thought');await page.locator('#send-button').click();
    await expect(page.locator('#conversation .message.nox:not(.draft)')).toContainText('A temporary guest thought');
    await expect(page.locator('#conversation-privacy')).toContainText('This visit only');
  }
  expect(await page.evaluate(()=>localStorage.getItem('nox.chats.v1')===originalArchive)).toBe(true);
});

test('a read-only owner cannot regenerate a saved unanswered message or start audio work',async({page})=>{
  // Resolves the recorded-turn retry bypass through the actual form/handler.
  // Synthetic provider and removed capability do not establish native browser locking.
  const requests=[];page.on('request',request=>{if(['/api/chat','/api/speech'].includes(new URL(request.url()).pathname))requests.push(request);});
  await page.addInitScript(archive=>{
    Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});archive.threads[0].turns=archive.threads[0].turns.slice(0,1);
    window.originalArchive=JSON.stringify(archive);localStorage.setItem('nox.chats.v1',originalArchive);
  },archive);
  await page.goto('/app#conversation');await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
  await page.locator('#message').fill('Saved question');await page.locator('#send-button').click();
  await expect(page.locator('#toast')).toContainText('Web Locks');await expect(page.locator('#message')).toHaveValue('Saved question');
  await expect(page.locator('#conversation .message.nox')).toHaveCount(0);expect(requests).toHaveLength(0);
  expect(await page.evaluate(()=>localStorage.getItem('nox.chats.v1')===originalArchive)).toBe(true);
});
