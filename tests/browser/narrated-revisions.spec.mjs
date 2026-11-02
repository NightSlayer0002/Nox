import {test,expect} from '@playwright/test';

const originalCode='  const prices = items.map(item => item.price);\n  return prices.reduce((sum, price) => sum + price, 0);';
const initialSpeech='[L2] Map each item to its price.\n[L3] Add the prices from zero and return the total.';

async function openSpokenRange(page){
  await page.addInitScript(()=>{
    window.ciUtterances=[];
    window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
    Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],cancel(){},speak(utterance){ciUtterances.push(utterance);},addEventListener(){}}});
  });
  await page.goto('/guest?prepare=code#conversation');
  await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await page.locator('#rehearsal-spoken-example').click();
  await page.getByText('Choose a complete section',{exact:true}).click();
  await page.locator('#rehearsal-start').fill('2');await page.locator('#rehearsal-end').fill('3');await page.locator('#rehearsal-select-range').click();
  await expect(page.locator('#rehearsal-range')).toHaveText('Lines 2–3 of 4');
}

async function changeAndCloseSource(page){
  await page.locator('#rehearsal-import').evaluate(node=>node.open=true);
  await page.locator('#rehearsal-example').click();await page.locator('#rehearsal-code .code-line-number').nth(8).click();
  await expect(page.locator('#rehearsal-range')).toHaveText('Lines 9–15 of 15');
  await page.locator('#rehearsal-close').click();
}

async function revise(page,kind){
  if(kind==='retry'){
    const answer=page.locator('#conversation .message.nox:not(.draft)');
    await answer.hover();await answer.getByRole('button',{name:'Retry NOX’s reply',exact:true}).click();
  }else{
    const question=page.locator('#conversation .message.user');await question.hover();
    await question.getByRole('button',{name:'Edit your message',exact:true}).click();
    await page.locator('#message').fill('Explain how this selected section totals the prices.');await page.locator('#message').press('Enter');
  }
}

async function expectFirstLine(page,index,text){
  await expect.poll(()=>page.evaluate(()=>ciUtterances.length)).toBe(index+1);
  expect(await page.evaluate(index=>ciUtterances[index].text,index)).toBe(text);
  await expect(page.locator('.code-line.speaking')).toHaveCount(0);
  await page.evaluate(index=>ciUtterances[index].onstart(),index);
  await expect(page.locator('.code-line.speaking')).toHaveAttribute('data-line','2');
  await page.locator('#rehearsal-stop').click();
  await expect(page.locator('.code-line.speaking')).toHaveCount(0);
}

test('initial, Retry and Edit speak the original selected source with narrated intent',async({page})=>{
  // Question: do the real revision controls regenerate synchronized narration after another source was selected and closed?
  // Limits: routed model packets and synthetic browser speech events; this does not establish physical audio or explanation accuracy.
  const requests=[],speeches=[initialSpeech,'[L2] Extract the item prices again.\n[L3] Return their sum starting at zero.','[L2] Build the selected list of prices.\n[L3] Sum those prices and return the result.'];
  await page.route('**/api/chat',route=>{requests.push(route.request().postDataJSON());return route.fulfill({json:{speech:speeches[requests.length-1],emotion:'curious',action:'none',memory:''}});});
  await openSpokenRange(page);await page.locator('#rehearsal-narrate').click();
  await expectFirstLine(page,0,'Line 2: Map each item to its price.');
  await expect(page.locator('#rehearsal-progress')).toHaveText('2/4 lines discussed · 0 self-checked');
  for(const [index,kind,text] of [[1,'retry','Line 2: Extract the item prices again.'],[2,'edit','Line 2: Build the selected list of prices.']]){
    await changeAndCloseSource(page);await revise(page,kind);
    await expect.poll(()=>requests.length).toBe(index+1);
    await expect(page.locator('#rehearsal-range')).toHaveText('Lines 2–3 of 4');
    await expectFirstLine(page,index,text);
    await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(1);
  }
  for(const request of requests)expect(request.context.rehearsal).toMatchObject({path:'total.js',revision:'spoken-v1',source:'example',startLine:2,endLine:3,code:originalCode,intent:'narrate'});
  await expect(page.locator('#rehearsal-replay')).toBeVisible();
});

for(const kind of ['retry','edit'])test(`a malformed ${kind} narration keeps the written answer without speaking or replaying an old plan`,async({page})=>{
  // Question: can an invalid revised line plan accidentally speak or leave the previous answer available as its replay?
  // Limits: missing-line alignment fixture and synthetic speech; well-formed but inaccurate model output still needs review.
  let requests=0;
  await page.route('**/api/chat',route=>route.fulfill({json:{speech:++requests===1?initialSpeech:'[L2] This revised answer omits line three.',emotion:'curious',action:'none',memory:''}}));
  await openSpokenRange(page);await page.locator('#rehearsal-narrate').click();
  await expectFirstLine(page,0,'Line 2: Map each item to its price.');
  await revise(page,kind);
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toContainText('This revised answer omits line three.');
  await expect(page.locator('#rehearsal-notice')).toContainText('every selected line');
  await expect(page.locator('#rehearsal-replay')).toBeHidden();
  await expect(page.locator('.code-line.speaking')).toHaveCount(0);
  expect(await page.evaluate(()=>ciUtterances.length)).toBe(1);
});

for(const change of ['range','close','thread'])test(`a delayed narrated Retry cannot speak after changing the ${change}`,async({page})=>{
  // Question: can an answer completing after its source, panel or conversation changed start stale narration?
  // Limits: one controlled network ordering in Chromium with synthetic speech; this does not prove every scheduling interleaving.
  let requests=0,release;const held=new Promise(resolve=>release=resolve);
  await page.route('**/api/chat',async route=>{if(++requests>1)await held;await route.fulfill({json:{speech:initialSpeech,emotion:'curious',action:'none',memory:''}}).catch(()=>{});});
  await openSpokenRange(page);await page.locator('#rehearsal-narrate').click();
  await expectFirstLine(page,0,'Line 2: Map each item to its price.');
  await revise(page,'retry');await expect.poll(()=>requests).toBe(2);
  if(change==='range')await page.locator('#rehearsal-code .code-line-number').first().click();
  else if(change==='close')await page.locator('#rehearsal-close').click();
  else await page.locator('#new-chat').click();
  release();
  await expect(page.locator('#chat-form')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#rehearsal-replay')).toBeHidden();
  await expect(page.locator('.code-line.speaking')).toHaveCount(0);
  expect(await page.evaluate(()=>ciUtterances.length)).toBe(1);
});

test('the completed entry rejects stale thread, session, source and closed-panel plans',async({page})=>{
  // Question: does the narration boundary itself reject stale work even when its caller delivers a packet?
  // Limits: detached real rehearsal markup and a synthetic voice adapter; shared-send cancellation is covered by the UI journeys above.
  await page.goto('/guest?prepare=code#conversation');await expect(page.locator('#brain-status')).toContainText('Guest visit');
  const result=await page.evaluate(async()=>{
    const {attachCodeRehearsal}=await import('/js/rehearsal-ui.js');
    const packet={speech:'[L1] Define the total function.\n[L2] Extract each price.\n[L3] Return the sum from zero.\n[L4] Close the function.',emotion:'curious',action:'none',memory:''};
    let owner='original-thread';
    const make=()=>{
      const target=document.implementation.createHTMLDocument('Rehearsal ownership');target.body.replaceWith(target.importNode(document.body,true));
      const spoken=[],ui=attachCodeRehearsal({documentTarget:target,getThread:()=>owner,send:async()=>{},voice:{stop(){},speak:text=>spoken.push(text)}});
      target.getElementById('rehearsal-spoken-example').click();return {target,spoken,ui,work:ui.capture('narrate')};
    };
    const current=make(),valid={accepted:current.ui.completed(current.work,packet),speech:current.spoken[0]};current.ui.dispose();
    const stale=[];
    for(const change of ['thread','session','source','closed']){
      owner='original-thread';const item=make();let work=item.work,other;
      if(change==='thread')owner='another-thread';
      else if(change==='session'){other=make();work=other.work;}
      else if(change==='source')item.target.querySelectorAll('.code-line-number')[1].click();
      else item.target.getElementById('rehearsal-close').click();
      stale.push({change,accepted:item.ui.completed(work,packet),speeches:item.spoken.length,replayHidden:item.target.getElementById('rehearsal-replay').hidden});
      item.ui.dispose();other?.ui.dispose();
    }
    return {valid,stale};
  });
  expect(result.valid).toEqual({accepted:true,speech:'Line 1: Define the total function.'});
  expect(result.stale).toEqual([
    {change:'thread',accepted:false,speeches:0,replayHidden:true},
    {change:'session',accepted:false,speeches:0,replayHidden:true},
    {change:'source',accepted:false,speeches:0,replayHidden:true},
    {change:'closed',accepted:false,speeches:0,replayHidden:true},
  ]);
});
