import {test,expect} from '@playwright/test';

test('the actual scheduled summary request includes a long answer’s final decision',async({page})=>{
  const answer='Detailed reasoning. '.repeat(350)+'Final decision: retain the violet lighthouse.';
  await page.addInitScript(answer=>{
    if(!localStorage.getItem('nox.chats.v1'))localStorage.setItem('nox.chats.v1',JSON.stringify({version:1,active:'summary-fixture',threads:[{id:'summary-fixture',title:'Summary fixture',mode:'companion',updated:1,turns:Array.from({length:20},(_,i)=>({role:i%2?'assistant':'user',content:i===1?answer:`Earlier turn ${i}`,seq:i+1}))}]}));
  },answer);
  await page.route('**/api/summary',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({summary:'Final decision: retain the violet lighthouse.'})}));
  await page.goto('/app#conversation');await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
  const summarizing=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/summary');
  await page.locator('#message').fill('Continue this conversation');await page.locator('#send-button').click();
  const request=await summarizing,body=request.postDataJSON();
  expect(body.turns.find(turn=>turn.content.includes('Final decision:'))?.content).toBe(answer);
  expect(Buffer.byteLength(request.postData(),'utf8')).toBeLessThan(65536);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('nox.chats.v1')).threads[0].summary)).toContain('violet lighthouse');
});
