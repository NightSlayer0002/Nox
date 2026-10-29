import {test,expect} from '@playwright/test';

test('the call dialog exposes the full answer while speaking only the bounded preview',async({page})=>{
  await page.setViewportSize({width:430,height:900});
  await page.addInitScript(()=>{
    window.ciSpoken=[];
    Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],cancel(){},speak(utterance){ciSpoken.push(utterance.text);queueMicrotask(()=>utterance.onstart?.());},addEventListener(){}}});
    window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
    window.SpeechRecognition=class{start(){window.ciRecognition=this;this.onstart?.();}abort(){this.onend?.();}stop(){this.onend?.();}};
  });
  const speech='A complete accessible explanation. '.repeat(60)+'Final conclusion: keep the violet lighthouse.';
  await page.route('**/api/chat',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({speech,emotion:'curious',action:'none',memory:''})}));
  await page.goto('/guest#conversation');await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await page.locator('#call-button').click();await page.getByRole('button',{name:'Connect microphone',exact:true}).click();
  await expect(page.locator('#voice-call-status')).toHaveText('Listening to you');
  await page.evaluate(()=>ciRecognition.onresult({results:[[{transcript:'Explain the lighthouse.'}]]}));
  const answer=page.getByRole('region',{name:'NOX’s reply'});
  await expect(answer).toContainText('Final conclusion: keep the violet lighthouse.');
  await expect(page.locator('#voice-call-reply')).toHaveText(speech);await expect(page.locator('#voice-call-reply')).toHaveAttribute('aria-live','polite');
  expect(await page.locator('#voice-call-reply').evaluate(node=>node.closest('[aria-hidden="true"], [inert]'))).toBeNull();
  expect((await page.evaluate(()=>ciSpoken.join(' '))).length).toBeLessThanOrEqual(420);
  const bounds=await page.evaluate(()=>{
    const bottom=id=>document.getElementById(id).getBoundingClientRect().bottom;
    return {text:bottom('voice-call-reply'),section:bottom('voice-call-answer'),controls:document.querySelector('.voice-call-actions').getBoundingClientRect().top};
  });
  expect(bounds.text).toBeLessThanOrEqual(bounds.section+1);
  expect(bounds.text).toBeLessThanOrEqual(bounds.controls);
  await page.getByRole('button',{name:'Close voice conversation',exact:true}).click();
  await expect(page.locator('#conversation .message.nox .message-content')).toHaveText(speech);
});

test('early speech failure keeps the complete answer inside the open call with deliberate recovery',async({page})=>{
  // Question: Can the person read the committed answer in the actual modal after speech fails before playback?
  // Limits: Chromium with synthetic recognition and an intentionally throwing speech adapter; not physical microphone, pronunciation or live TTS latency.
  await page.addInitScript(()=>{
    window.ciListens=0;window.ciSpeaks=0;
    Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],cancel(){},speak(){ciSpeaks++;throw Error('Synthetic early speech failure');},addEventListener(){}}});
    window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
    window.SpeechRecognition=class{start(){ciListens++;window.ciRecognition=this;this.onstart?.();}abort(){this.onend?.();}stop(){this.onend?.();}};
  });
  const speech='This complete written answer survived audio failure. Final conclusion: keep the violet lighthouse.';
  await page.route('**/api/chat',route=>route.fulfill({json:{speech,emotion:'curious',action:'none',memory:''}}));
  await page.goto('/guest#conversation');await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await page.locator('#call-button').click();await page.getByRole('button',{name:'Connect microphone',exact:true}).click();await expect(page.locator('#voice-call-status')).toHaveText('Listening to you');
  await page.evaluate(()=>ciRecognition.onresult({results:[[{transcript:'Explain this with a complete answer.'}]]}));
  await expect(page.locator('#voice-call-dialog')).toHaveAttribute('data-status','error');await expect(page.locator('#voice-call-answer')).toBeVisible();await expect(page.locator('#voice-call-reply')).toHaveText(speech);
  await expect(page.getByRole('button',{name:'Resume listening',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Type a message instead',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>({listens:ciListens,speaks:ciSpeaks}))).toEqual({listens:1,speaks:1});
  await page.getByRole('button',{name:'Close voice conversation',exact:true}).click();await expect(page.locator('#conversation .message.nox .message-content')).toHaveText(speech);
});
