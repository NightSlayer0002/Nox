import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';

async function openExample(page){
  await page.goto('/guest?prepare=code#conversation');
  await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await page.locator('#rehearsal-example').click();
  await expect(page.locator('#rehearsal-range')).toHaveText('Lines 1–8 of 15');
}

test('source tabs keep files accessible by keyboard and import choices preserve drafts',async({page})=>{
  // Question: can the refined file/import controls keep exact sources and drafts while navigating by keyboard?
  // Limits: Chromium accessibility semantics and source ownership, not screen-reader hardware or visual taste.
  await openExample(page);await page.locator('#rehearsal-import').evaluate(node=>node.open=true);
  await page.getByRole('tab',{name:'Paste code',exact:true}).click();
  await page.locator('#rehearsal-filename').fill('second.js');await page.locator('#rehearsal-paste').fill('const second = 2;');
  await page.getByRole('tab',{name:'GitHub',exact:true}).click();
  await expect(page.locator('#rehearsal-paste')).toBeHidden();
  await page.getByRole('tab',{name:'Paste code',exact:true}).click();await expect(page.locator('#rehearsal-paste')).toHaveValue('const second = 2;');
  await page.locator('#rehearsal-use-paste').click();
  const second=page.getByRole('tab',{name:'second.js',exact:true});await expect(second).toHaveAttribute('aria-selected','true');
  await second.focus();await second.press('ArrowLeft');
  await expect(page.getByRole('tab',{name:'retry.js',exact:true})).toBeFocused();await expect(page.locator('#rehearsal-code')).toContainText('return await task();');
  await expect(page.getByRole('tabpanel',{name:/retry\.js/})).toBeVisible();
  await page.getByRole('tab',{name:'retry.js',exact:true}).press('End');await expect(second).toBeFocused();
  await expect(page.locator('#rehearsal-code')).toHaveText('1const second = 2;');
});

test('coloured source keeps exact text and markup remains inert',async({page})=>{
  // Question: can syntax-coloured source preserve the original text and keep markup inside code inert?
  // Limits: this covers DOM construction and submitted evidence, not every possible injection or language grammar.
  await openExample(page);await page.locator('#rehearsal-import').evaluate(node=>node.open=true);
  await page.getByRole('tab',{name:'Paste code',exact:true}).click();
  const source='const template = "<img src=x onerror=window.codeExecuted=true>";\n// नमस्ते 👋';
  await page.locator('#rehearsal-filename').fill('template.js');await page.locator('#rehearsal-paste').fill(source);await page.locator('#rehearsal-use-paste').click();
  expect((await page.locator('#rehearsal-code code').allTextContents()).join('\n')).toBe(source);
  await expect(page.locator('#rehearsal-code .token-keyword')).toContainText('const');await expect(page.locator('#rehearsal-code .token-string')).toContainText('<img');
  await expect(page.locator('#rehearsal-code img, #rehearsal-code script')).toHaveCount(0);expect(await page.evaluate(()=>window.codeExecuted)).toBeUndefined();
  const request=page.waitForRequest('**/api/chat');await page.locator('#rehearsal-explain').click();expect((await request).postDataJSON().context.rehearsal.code).toBe(source);
});

test('spoken walkthrough follows actual playback events and Stop prevents another line',async({page})=>{
  // Question: are the highlighted source line and speech lifecycle synchronized without duplicate default narration?
  // Limits: synthetic speech events, not physical audio, microphone input or Orpheus quality.
  await page.addInitScript(()=>{window.ciUtterances=[];window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],cancel(){},speak(utterance){ciUtterances.push(utterance);},addEventListener(){}}});});
  await page.route('**/api/chat',route=>route.fulfill({json:{speech:'[L1] Declare a total function receiving items.\n[L2] Map each item to its price.\n[L3] Add the prices, starting at zero, and return the result.\n[L4] Close the function body.',emotion:'curious',action:'none',memory:''}}));
  await page.goto('/guest?prepare=code#conversation');await expect(page.locator('#brain-status')).toContainText('Guest visit');await page.locator('#rehearsal-spoken-example').click();
  await page.locator('#rehearsal-narrate').click();await expect.poll(()=>page.evaluate(()=>ciUtterances.length)).toBe(1);
  await expect(page.locator('#rehearsal-progress')).toHaveText('4/4 lines discussed · 0 self-checked');
  await expect(page.locator('.code-line.speaking')).toHaveCount(0);await page.evaluate(()=>ciUtterances[0].onstart());
  await expect(page.locator('.code-line.speaking')).toHaveAttribute('data-line','1');
  await page.evaluate(()=>ciUtterances[0].onend());await expect.poll(()=>page.evaluate(()=>ciUtterances.length)).toBe(2);
  await page.evaluate(()=>ciUtterances[1].onstart());await expect(page.locator('.code-line.speaking')).toHaveAttribute('data-line','2');
  await page.locator('#rehearsal-stop').click();await expect(page.locator('.code-line.speaking')).toHaveCount(0);
  await page.evaluate(()=>ciUtterances[1].onend());expect(await page.evaluate(()=>ciUtterances.length)).toBe(2);
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(1);await expect(page.locator('#rehearsal-range')).toHaveText('Lines 1–4 of 4');
});

test('a malformed spoken plan keeps the answer and spends no speech requests',async({page})=>{
  // Question: does missing line alignment stop speech instead of highlighting fabricated positions?
  // Limits: one malformed fixture; factually wrong but well-aligned explanations still need review.
  const requests=[];page.on('request',r=>{if(r.url().endsWith('/api/speech'))requests.push(r);});
  await page.route('**/api/chat',route=>route.fulfill({json:{speech:'[L1] Just one line.',emotion:'curious',action:'none',memory:''}}));
  await page.goto('/guest?prepare=code#conversation');await expect(page.locator('#brain-status')).toContainText('Guest visit');await page.locator('#rehearsal-spoken-example').click();
  await page.locator('#rehearsal-narrate').click();await expect(page.locator('#rehearsal-notice')).toContainText('every selected line');
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toContainText('Just one line.');expect(requests).toHaveLength(0);
  await expect(page.locator('#rehearsal-progress')).toHaveText('0/4 lines discussed · 0 self-checked');
});

for(const operation of ['send','retry'])test(`a source change cancels ${operation} while its history write is queued`,async({page})=>{
  // Question: does source ownership still hold when a user action happens inside a storage-lock wait?
  // Limits: one controlled Chromium lock ordering, not a proof of every cross-tab interleaving.
  await page.goto('/app?prepare=code#conversation');await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');await page.locator('#rehearsal-example').click();
  if(operation==='retry'){await page.locator('#rehearsal-explain').click();await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(1);}
  const before=await page.evaluate(()=>localStorage.getItem('nox.chats.v1')),requests=[];
  page.on('request',r=>{if(r.url().endsWith('/api/chat'))requests.push(r);});
  await page.evaluate(()=>new Promise(resolve=>{window.heldWrite=navigator.locks.request('nox.chat-history.write',()=>new Promise(release=>{window.releaseWrite=release;resolve();}));}));
  if(operation==='send')await page.locator('#rehearsal-explain').click();
  else{const reply=page.locator('#conversation .message.nox');await reply.hover();await reply.getByRole('button',{name:'Retry NOX’s reply',exact:true}).click();}
  await expect.poll(()=>page.evaluate(async()=>(await navigator.locks.query()).pending.some(lock=>lock.name==='nox.chat-history.write'))).toBe(true);
  await page.locator('#rehearsal-next').click();await page.evaluate(async()=>{releaseWrite();await heldWrite;});
  await expect(page.locator('#rehearsal-range')).toHaveText('Lines 9–15 of 15');
  await expect.poll(()=>page.evaluate(async()=>(await navigator.locks.query()).pending.length)).toBe(0);
  expect(await page.evaluate(()=>localStorage.getItem('nox.chats.v1'))).toBe(before);expect(requests).toHaveLength(0);
});

for(const choice of ['close','example','range'])test(`successful late file import cannot override ${choice}`,async({page})=>{
  // Question: does a successful old import lose ownership after a newer user choice?
  // Limits: delayed File API fixture; not disk reliability or GitHub transport testing.
  await openExample(page);await page.locator('#rehearsal-import').evaluate(node=>node.open=true);
  await page.evaluate(()=>{const read=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){await new Promise(resolve=>window.releaseFile=resolve);return read.call(this);};});
  await page.locator('#rehearsal-local').setInputFiles({name:'late.js',mimeType:'text/javascript',buffer:Buffer.from('late import')});
  await expect.poll(()=>page.evaluate(()=>typeof window.releaseFile)).toBe('function');
  if(choice==='close')await page.locator('#rehearsal-close').click();
  else if(choice==='example')await page.locator('#rehearsal-example').click();
  else await page.locator('#rehearsal-next').click();
  await page.evaluate(()=>window.releaseFile());
  await expect(page.locator('#rehearsal-range')).toHaveText(choice==='range'?'Lines 9–15 of 15':'Lines 1–8 of 15');
  if(choice==='close')await expect(page.locator('#rehearsal-panel')).toBeHidden();
  else await expect(page.locator('#rehearsal-loaded [aria-selected=true]')).toHaveText('retry.js');
});

test('missing original code after owner reload leaves the saved answer intact',async({page})=>{
  // Question: can Retry destroy saved work when its visit-only evidence is unavailable?
  // Limits: owner local persistence only; guests intentionally clear on refresh.
  await page.goto('/app?prepare=code#conversation');await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
  await page.locator('#rehearsal-example').click();await page.locator('#rehearsal-explain').click();
  const reply=page.locator('#conversation .message.nox:not(.draft)');await expect(reply).toHaveCount(1);const answer=await reply.textContent();
  await page.reload();await expect(reply).toHaveCount(1);const before=await page.evaluate(()=>localStorage.getItem('nox.chats.v1'));
  const requests=[];page.on('request',r=>{if(r.url().endsWith('/api/chat'))requests.push(r);});
  await reply.hover();await reply.getByRole('button',{name:'Retry NOX’s reply',exact:true}).click();
  await expect(page.locator('#toast')).toContainText('original code');expect(await reply.textContent()).toBe(answer);expect(requests).toHaveLength(0);
  expect(await page.evaluate(()=>localStorage.getItem('nox.chats.v1'))).toBe(before);
});

test('a complete user-selected function reaches the request unchanged',async({page})=>{
  // Question: can source-linked discussion cover a logical unit longer than the default preview?
  // Limits: the user chooses completeness; no parser or synchronized speech is implied.
  await openExample(page);await page.getByText('Choose a complete section',{exact:true}).click();
  await page.locator('#rehearsal-start').fill('1');await page.locator('#rehearsal-end').fill('11');await page.locator('#rehearsal-select-range').click();
  await expect(page.locator('#rehearsal-range')).toHaveText('Lines 1–11 of 15');
  const request=page.waitForRequest('**/api/chat');await page.locator('#rehearsal-explain').click();
  const source=(await request).postDataJSON().context.rehearsal;expect(source.endLine).toBe(11);expect(source.code.endsWith('\n}')).toBe(true);
});

for(const width of [320,390,768,1440])test(`source stays visible and conversation keeps its draft at ${width}px`,async({page})=>{
  // Question: can a real browser keep source, committed coverage and an unrelated draft aligned?
  // Limits: synthetic replies; does not establish explanation accuracy, microphone quality or learning.
  await page.setViewportSize({width,height:900});await openExample(page);
  const requests=[];page.on('request',request=>{if(request.url().endsWith('/api/chat'))requests.push(request.postDataJSON());});
  await page.locator('#message').fill('An unfinished unrelated thought');
  await page.locator('#rehearsal-explain').click();
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(1);
  await expect(page.locator('#message')).toHaveValue('An unfinished unrelated thought');
  await expect(page.locator('#rehearsal-progress')).toHaveText('8/15 lines discussed · 0 self-checked');
  expect(requests[0].context.rehearsal.code).toContain('return await task();');
  expect(requests[0].context.rehearsal.endLine).toBe(8);
  await page.locator('#rehearsal-ready').check();
  await page.locator('#rehearsal-next').click();
  await expect(page.locator('#rehearsal-range')).toHaveText('Lines 9–15 of 15');
  await expect(page.locator('#rehearsal-progress')).toHaveText('8/15 lines discussed · 8 self-checked');
  const bounds=await page.locator('#rehearsal-panel').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:`artifacts/rehearsal-${width}.png`});
});

test('retry restores the original code before replacing a reply',async({page})=>{
  // Question: can a changed or closed source panel redirect an older retry to unrelated code?
  // Limits: synthetic model responses; source ownership does not establish factual quality.
  await openExample(page);await page.locator('#rehearsal-explain').click();
  const reply=page.locator('#conversation .message.nox:not(.draft)');await expect(reply).toHaveCount(1);
  await page.locator('#rehearsal-import').evaluate(node=>node.open=true);
  await page.getByRole('tab',{name:'Paste code',exact:true}).click();
  await page.locator('#rehearsal-filename').fill('other.js');await page.locator('#rehearsal-paste').fill('x'.repeat(6001));
  await page.locator('#rehearsal-use-paste').click();await page.locator('#rehearsal-close').click();
  const request=page.waitForRequest('**/api/chat');await reply.hover();await reply.getByRole('button',{name:'Retry NOX’s reply',exact:true}).click();
  const data=(await request).postDataJSON();expect(data.context.rehearsal.path).toBe('retry.js');expect(data.context.rehearsal.intent).toBe('explain');
  await expect(page.locator('#rehearsal-range')).toHaveText('Lines 1–8 of 15');await expect(reply).toHaveCount(1);
});

test('invalid corrections survive rerender and prevent an AI request until fixed',async({page})=>{
  // Question: could a visible invalid draft be silently replaced or send older corrections?
  // Limits: tests count/length validation, not semantic truth of a correction.
  await openExample(page);await page.getByText('My goal & corrections',{exact:true}).click();
  const draft=Array.from({length:7},(_,i)=>`Correction ${i}`).join('\n');await page.locator('#rehearsal-corrections').fill(draft);
  const requests=[];page.on('request',r=>{if(r.url().endsWith('/api/chat'))requests.push(r);});
  await page.locator('#rehearsal-explain').click();await expect(page.locator('#rehearsal-notice')).toContainText('six corrections');
  await expect(page.locator('#rehearsal-notice')).toBeInViewport();
  await page.locator('#rehearsal-ready').check();await expect(page.locator('#rehearsal-corrections')).toHaveValue(draft);expect(requests).toHaveLength(0);
  await page.locator('#rehearsal-corrections').fill('I wrote this function.');await page.locator('#message').fill('It retries because an operation might fail temporarily.');await page.locator('#message').press('Enter');
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(1);
  const downloading=page.waitForEvent('download');await page.locator('#rehearsal-export').click();const download=await downloading;
  expect(await fs.readFile(await download.path(),'utf8')).toContain('Your message:\nIt retries because an operation might fail temporarily.');
});

test('closing preparation invalidates a delayed repository import',async({page})=>{
  // Question: can late network completion reopen a panel after the user deliberately closed it?
  // Limits: browser-routed API fixture, not GitHub availability or rate limits.
  await openExample(page);await page.locator('#rehearsal-import').evaluate(node=>node.open=true);
  let release;const held=new Promise(resolve=>release=resolve);
  await page.route('https://api.github.com/**',async route=>{await held;await route.fulfill({status:404,json:{message:'Not found'}}).catch(()=>{});});
  await page.locator('#rehearsal-url').fill('https://github.com/example/repo');const request=page.waitForRequest('https://api.github.com/**');
  await page.locator('#rehearsal-github').click();await request;await page.locator('#rehearsal-close').click();release();
  await expect(page.locator('#rehearsal-panel')).toBeHidden();await page.locator('#rehearsal-toggle').click();
  await expect(page.locator('#rehearsal-range')).toHaveText('Lines 1–8 of 15');await expect(page.locator('#rehearsal-import')).toHaveAttribute('aria-busy','false');
});

test('code is literal text, corrections reach the model, and the call shows the selected excerpt',async({page})=>{
  // Question: does displayed untrusted code remain inert and present in the existing voice call?
  // Limits: no semantic prompt-injection guarantee or live speech alignment is inferred.
  await openExample(page);await page.locator('#rehearsal-import').evaluate(node=>node.open=true);
  await page.getByRole('tab',{name:'Paste code',exact:true}).click();
  await page.locator('#rehearsal-paste').fill('<script>window.codeExecuted=true</script>\nconst x = 7;');
  await page.locator('#rehearsal-filename').fill('example.html');await page.locator('#rehearsal-use-paste').click();
  await expect(page.locator('#rehearsal-code')).toContainText('<script>window.codeExecuted=true</script>');
  expect(await page.evaluate(()=>window.codeExecuted)).toBeUndefined();
  await page.getByText('My goal & corrections',{exact:true}).click();
  await page.locator('#rehearsal-corrections').fill('I wrote the UI, not the API.');
  const request=page.waitForRequest(request=>request.url().endsWith('/api/chat'));
  await page.locator('#rehearsal-question').click();
  expect((await request).postDataJSON().context.rehearsal.corrections).toEqual(['I wrote the UI, not the API.']);
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(1);
  await expect(page.locator('#rehearsal-progress')).toHaveText('0/2 lines discussed · 0 self-checked');
  await page.locator('#call-button').click();
  await expect(page.locator('#rehearsal-call-source')).toBeVisible();
  await expect(page.locator('#rehearsal-call-source')).toContainText('example.html · lines 1–2');
  await page.locator('#voice-call-close').click();
});

test('changing the selection cancels an old response and new conversations have no code context',async({page})=>{
  // Question: can a delayed request mark a later selection or leak the previous conversation's file?
  // Limits: Chromium transport race, not physical-device timing or persistence guarantees.
  await openExample(page);
  let release;const held=new Promise(resolve=>release=resolve);
  await page.route('**/api/chat',async route=>{await held;await route.fulfill({json:{speech:'An old explanation.',emotion:'curious',action:'none',memory:''}}).catch(()=>{});});
  const request=page.waitForRequest('**/api/chat');await page.locator('#rehearsal-explain').click();await request;
  await page.locator('#rehearsal-next').click();release();
  await expect(page.locator('#rehearsal-progress')).toHaveText('0/15 lines discussed · 0 self-checked');
  await page.locator('#new-chat').click();
  await expect(page.locator('#rehearsal-panel')).toBeHidden();
  await page.locator('#rehearsal-toggle').click();await expect(page.locator('#rehearsal-work')).toBeHidden();
});

test('failed explanation preserves source and export reports no completed coverage',async({page})=>{
  // Question: are failure and locally exported preparation faithful to actual completion?
  // Limits: synthetic HTTP failure, not provider retry or factual correctness.
  await openExample(page);
  await page.route('**/api/chat',route=>route.fulfill({status:503,json:{error:'Synthetic service unavailable'}}));
  await page.locator('#rehearsal-explain').click();await expect(page.locator('#conversation')).toContainText('Synthetic service unavailable');
  await expect(page.locator('#rehearsal-progress')).toHaveText('0/15 lines discussed · 0 self-checked');
  const download=page.waitForEvent('download');await page.locator('#rehearsal-export').click();
  expect((await download).suggestedFilename()).toBe('nox-code-preparation.txt');
});

