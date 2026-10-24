import {test,expect} from '@playwright/test';

async function openChat(page){await page.goto('/guest#conversation');await expect(page.locator('#brain-status')).toContainText('Guest visit');}
async function send(page,text){await page.locator('#message').fill(text);await page.locator('#send-button').click();}
const answers=page=>page.locator('#conversation .message.nox:not(.draft) .message-content');

test('cold guest entry preserves the selected panel while status headers precede its body',async({page,context})=>{
  await context.addCookies([{name:'nox-ci-delayed-status',value:'1',url:'http://127.0.0.1:3017'}]);
  const header=page.waitForResponse(response=>response.url().endsWith('/api/status'));
  await page.goto('/guest#conversation',{waitUntil:'domcontentloaded'});await header;
  await expect(page.locator('body')).toHaveAttribute('data-view','conversation');
  await expect(page.locator('[data-panel="afterimage"]')).toBeHidden();
  await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await send(page,'CI cold entry');await expect(answers(page)).toContainText('Synthetic answer to: CI cold entry');
});

test('IME candidate confirmation preserves the draft and deliberate Enter submits once',async({page})=>{
  await openChat(page);const input=page.locator('#message');await input.fill('日本語の確認');
  await input.dispatchEvent('compositionstart');await input.dispatchEvent('keydown',{key:'Enter',isComposing:true,bubbles:true});
  await expect(page.locator('#conversation .message.user')).toHaveCount(0);
  await input.dispatchEvent('compositionend');
  await input.dispatchEvent('keydown',{key:'Enter',keyCode:229,which:229,bubbles:true});
  await expect(page.locator('#conversation .message.user')).toHaveCount(0);
  await input.press('Shift+Enter');await expect(input).toHaveValue('日本語の確認\n');
  await input.press('Enter');await expect(answers(page)).toContainText('日本語の確認');
  await expect(page.locator('#conversation .message.user')).toHaveCount(1);
});

test('send, Stop and retry preserve history and restore the failed draft without duplicate user turns',async({page})=>{
  await openChat(page);await send(page,'CI wait for stop');await expect(page.locator('#cancel-reply')).toBeVisible();
  await page.locator('#cancel-reply').click();await expect(page.locator('#cancel-reply')).toBeHidden();
  await send(page,'CI retry after failure');await expect(page.locator('#message')).toHaveValue('CI retry after failure');
  await page.locator('#send-button').click();await expect(answers(page)).toContainText('Synthetic answer to: CI retry after failure');
  await expect(page.locator('#conversation .message.user')).toHaveCount(2);
});

test('completed prose uses safe formatting, message menus support keys and navigation retains the conversation',async({page})=>{
  await openChat(page);await send(page,'CI format prose');await expect(answers(page)).toHaveText('A useful plan\n1. Read.\n2. Practice.');
  const trigger=page.locator('#conversation .message.nox button[aria-label="Explore this message with NOX"]');
  await trigger.focus();await trigger.press('Enter');
  const menu=page.getByRole('group',{name:'Actions for this message'});
  await expect(menu.getByRole('button',{name:/Explain/})).toBeFocused();await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('button',{name:/Read aloud/})).toBeFocused();await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);await expect(trigger).toBeFocused();
  await page.locator('nav[aria-label="Workspace"] a[data-view="discover"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-view','discover');await page.goBack();
  await expect(page.locator('body')).toHaveAttribute('data-view','conversation');await expect(answers(page)).toContainText('A useful plan');
});

test('a failed lazy receiver leaves navigation and ordinary conversation usable',async({page})=>{
  await page.route('**/dist/chunks/afterimage-*.js',route=>route.abort());
  await page.goto('/guest#afterimage');await expect(page.getByRole('alert')).toContainText('receiver could not load');
  await page.locator('nav[aria-label="Workspace"] a[data-view="conversation"]').click();
  await expect(page.locator('#brain-status')).toContainText('Guest visit');await send(page,'CI lazy recovery');
  await expect(answers(page)).toContainText('Synthetic answer to: CI lazy recovery');
});

test('real browser media cancellation stops synthetic tracks after a late acquisition',async({page,context})=>{
  await context.grantPermissions(['camera']);await openChat(page);
  const result=await page.evaluate(async()=>{
    const {createCamera}=await import('/js/camera.js');const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let resolveAcquisition,stream;const acquired=new Promise(resolve=>{resolveAcquisition=resolve;});
    navigator.mediaDevices.getUserMedia=async options=>{stream=await original(options);await acquired;return stream;};
    const camera=createCamera(),started=camera.start();camera.stop();
    // The track comes from Chromium's fake camera, never a physical device.
    while(!stream)await new Promise(resolve=>setTimeout(resolve,10));resolveAcquisition();
    let reason;try{await started;}catch(error){reason=error.name;}
    navigator.mediaDevices.getUserMedia=original;
    return {reason,active:camera.active,tracks:stream.getTracks().map(track=>track.readyState)};
  });
  expect(result).toEqual({reason:'AbortError',active:false,tracks:['ended']});
});
