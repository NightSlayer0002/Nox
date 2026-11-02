import {test,expect} from '@playwright/test';

async function openDictation(page){
  await page.addInitScript(()=>{
    window.recognizers=[];
    window.SpeechRecognition=class{
      constructor(){recognizers.push(this);}
      start(){this.onstart?.();}
      abort(){this.onend?.();}
    };
  });
  await page.goto('/guest#conversation');
  await expect(page.locator('#brain-status')).toContainText('Guest visit');
}
async function transcript(page,text,index=0){
  await page.evaluate(({text,index})=>recognizers[index].onresult({results:[[{transcript:text}]]}),{text,index});
}

test('dictation preserves typed work and waits for explicit Send',async({page})=>{
  // Question: does the actual composer insert speech at the captured caret, retain typed work, and wait for review?
  // Limits: synthetic recognition events in Chromium; not microphone accuracy, permissions, or physical-phone keyboards.
  await openDictation(page);const requests=[];page.on('request',r=>{if(r.url().endsWith('/api/chat'))requests.push(r.postDataJSON());});
  await page.locator('#message').fill('I wrote the interface.');
  await page.locator('#message').evaluate(input=>input.setSelectionRange(input.value.length,input.value.length));
  await page.locator('#mic-button').click();await transcript(page,'I want to explain its design.');
  await expect(page.locator('#message')).toHaveValue('I wrote the interface. I want to explain its design.');
  await expect(page.locator('#toast')).toContainText('Review your message');expect(requests).toHaveLength(0);
  await page.locator('#send-button').click();
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(1);
  expect(requests).toHaveLength(1);expect(requests[0].message).toBe('I wrote the interface. I want to explain its design.');
});

test('stopped and superseded dictation cannot overwrite a newer draft',async({page})=>{
  // Question: can late recognition from a canceled attempt or a changed draft still insert or send obsolete text?
  // Limits: selected callback orderings, not every native recognition race or cross-tab edit.
  await openDictation(page);const requests=[];page.on('request',r=>{if(r.url().endsWith('/api/chat'))requests.push(r);});
  await page.locator('#message').fill('Original draft');await page.locator('#mic-button').click();await page.locator('#mic-button').click();
  await transcript(page,'Canceled speech');await expect(page.locator('#message')).toHaveValue('Original draft');
  await page.locator('#mic-button').click();await page.locator('#message').fill('A newer thought');
  await transcript(page,'Stale speech',1);await expect(page.locator('#message')).toHaveValue('A newer thought');
  expect(requests).toHaveLength(0);
});
