import {test,expect} from '@playwright/test';

test('structured answers stay safe, readable on mobile and exact when copied',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);await page.setViewportSize({width:430,height:900});
  const code='const path = "C:\\new\\notes";\n'+('a'.repeat(240));
  const speech='## A useful plan\n\nA **clear** answer with [reference](https://example.com/docs).\n\n1. Read.\n2. Practice.\n\n```js\n'+code+'\n```\n\n<img src=x onerror=alert(1)> [unsafe](javascript:alert)';
  await page.route('**/api/chat',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({speech,emotion:'curious',action:'none',memory:''})}));
  await page.goto('/guest#conversation');await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await page.locator('#message').fill('Give me a useful plan');await page.locator('#send-button').click();
  const message=page.locator('#conversation .message.nox:not(.draft)'),answer=message.locator('.message-content');
  await expect(answer.getByRole('heading',{name:'A useful plan'})).toBeVisible();
  await expect(answer.getByRole('listitem')).toHaveText(['Read.','Practice.']);await expect(answer.locator('pre code')).toHaveText(code);
  await expect(answer.getByRole('link',{name:'reference'})).toHaveAttribute('href','https://example.com/docs');
  await expect(answer.locator('img,script')).toHaveCount(0);await expect(answer.locator('a')).toHaveCount(1);
  expect(await answer.evaluate(node=>node.scrollWidth-node.clientWidth)).toBeLessThan(2);
  await answer.getByRole('heading',{name:'A useful plan'}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'artifacts/oct27-answer-mobile.png'});
  const copy=message.getByRole('button',{name:'Copy NOX’s reply',exact:true});await copy.focus();await copy.press('Enter');
  // Windows normalizes clipboard newlines to CRLF; the reply itself is unchanged.
  expect((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n')).toBe(speech);
  await message.getByRole('button',{name:'Explore this message with NOX',exact:true}).click();
  const explaining=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/chat');
  await page.getByRole('group',{name:'Actions for this message'}).getByRole('button',{name:/Explain/}).click();
  expect((await explaining).postDataJSON().message).toContain('1. Read.\n2. Practice.');
  expect((await explaining).postDataJSON().message).toContain('[reference](https://example.com/docs)');
});
