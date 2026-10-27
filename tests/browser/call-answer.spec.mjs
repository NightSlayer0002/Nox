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
  await page.getByRole('button',{name:'Close voice conversation',exact:true}).click();
  await expect(page.locator('#conversation .message.nox .message-content')).toHaveText(speech);
});
