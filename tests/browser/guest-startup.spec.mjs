import {test,expect} from '@playwright/test';

async function holdInitialStatus(page,phase){
  await page.addInitScript(({phase})=>{
    const fetch=window.fetch.bind(window);
    let first=true,release;
    const gate=new Promise(resolve=>{release=resolve;});
    window.statusStartup={requests:0,waiting:false,released:false,microphoneStarts:0};
    window.releaseInitialStatus=()=>{statusStartup.released=true;release();};
    window.fetch=async(input,options)=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      if(url.pathname!=='/api/status')return fetch(input,options);
      statusStartup.requests++;
      if(!first)return fetch(input,options);
      first=false;statusStartup.waiting=true;
      if(phase==='headers'){await gate;return fetch(input,options);}
      const response=await fetch(input,options);
      // Headers resolve normally; only the actual response body is held.
      return new Response(new ReadableStream({async start(controller){
        try{await gate;const reader=response.body.getReader();while(true){const {done,value}=await reader.read();if(done)break;controller.enqueue(value);}controller.close();}
        catch(error){controller.error(error);}
      }}),{status:response.status,headers:response.headers});
    };
    // Recognition is synthetic. Pending connection guards must prevent start().
    window.SpeechRecognition=class{start(){statusStartup.microphoneStarts++;}stop(){}abort(){}};
  },{phase});
}

for(const phase of ['headers','body'])test(`guest activities and typing are ready while initial status ${phase} are pending`,async({page})=>{
  await holdInitialStatus(page,phase);
  const chats=[];page.on('request',request=>{if(new URL(request.url()).pathname==='/api/chat')chats.push(request);});
  await page.goto('/guest#learn',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('slider',{name:/Move the Moon/})).toBeVisible({timeout:2500});
  await page.getByRole('slider',{name:/Move the Moon/}).fill('217');
  await expect(page.locator('.eact-moon output')).toHaveText('217°');
  await expect(page.locator('#workspace-background .source-scene')).toHaveCount(1);
  await page.getByRole('button',{name:'Back to NOX',exact:true}).click();
  const input=page.locator('#message');await input.fill(`My thought while ${phase} wait`);await input.press('Enter');
  await expect(page.locator('#connection-message')).toContainText('Checking the AI connection');
  await expect(page.locator('#send-button')).toBeDisabled();await expect(input).toHaveValue(`My thought while ${phase} wait`);
  await expect(page.locator('#conversation .message.user')).toHaveCount(0);await expect(page.locator('#inside-dialog')).not.toBeVisible();
  await page.locator('#call-button').click();await page.getByRole('button',{name:'Connect microphone',exact:true}).click();
  await expect(page.locator('#voice-call-status')).toContainText('AI connection is not ready');
  await page.getByRole('button',{name:'Close voice conversation',exact:true}).click();
  await expect(input).toHaveValue(`My thought while ${phase} wait`);
  expect(await page.evaluate(()=>({...statusStartup}))).toEqual({requests:1,waiting:true,released:false,microphoneStarts:0});expect(chats).toHaveLength(0);
  await page.evaluate(()=>releaseInitialStatus());
  await expect(page.locator('#brain-status')).toContainText('Guest visit');await expect(page.locator('#send-button')).toBeEnabled();
  await expect(page.locator('#reply-timing')).not.toContainText('not ready');
  await page.locator('nav[aria-label="Workspace"] a[data-view="discover"]').click();
  await page.getByRole('link',{name:/Why does the Moon/}).click();await expect(page.locator('.eact-moon output')).toHaveText('217°');
  await page.getByRole('button',{name:'Back to NOX',exact:true}).click();await expect(input).toHaveValue(`My thought while ${phase} wait`);
  await page.locator('#send-button').click();await expect(page.locator('#conversation .message.nox:not(.draft)')).toContainText(`Synthetic answer to: My thought while ${phase} wait`);
  expect(chats).toHaveLength(1);expect(await page.evaluate(()=>statusStartup.requests)).toBe(1);
});

test('failed guest connection can retry without refreshing the draft or local activity',async({page})=>{
  let checks=0;const chats=[];
  await page.route('**/api/status',route=>{checks++;return checks===1?route.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic unavailable status"}'}):route.continue();});
  page.on('request',request=>{if(new URL(request.url()).pathname==='/api/chat')chats.push(request);});
  await page.goto('/guest#learn');await page.getByRole('slider',{name:/Move the Moon/}).fill('123');
  await page.getByRole('button',{name:'Back to NOX',exact:true}).click();
  const input=page.locator('#message');await input.fill('Keep my failed-connection draft');await input.press('Enter');
  const retry=page.getByRole('button',{name:'Retry AI connection',exact:true});await expect(retry).toBeEnabled();
  expect(checks).toBe(1);expect(chats).toHaveLength(0);await expect(page.locator('#send-button')).toBeDisabled();
  await retry.click();await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await expect(input).toHaveValue('Keep my failed-connection draft');await expect(page.locator('#send-button')).toBeEnabled();
  await page.locator('nav[aria-label="Workspace"] a[data-view="discover"]').click();await page.getByRole('link',{name:/Why does the Moon/}).click();
  await expect(page.locator('.eact-moon output')).toHaveText('123°');await page.getByRole('button',{name:'Back to NOX',exact:true}).click();
  await input.press('Enter');await expect(page.locator('#conversation .message.nox:not(.draft)')).toContainText('Synthetic answer to: Keep my failed-connection draft');
  expect(checks).toBe(2);expect(chats).toHaveLength(1);
});

for(const action of ['Explore with NOX','Continue in conversation'])test(`pending activity handoffs preserve lesson notes and the chat draft: ${action}`,async({page})=>{
  await holdInitialStatus(page,'body');const chats=[];
  page.on('request',request=>{if(new URL(request.url()).pathname==='/api/chat')chats.push(request);});
  await page.goto('/guest#conversation',{waitUntil:'domcontentloaded'});
  const draft='Keep my separate chat draft',topic='Why does the Moon look different each night?',explanation='We see different parts of the sunlit half.';
  await page.locator('#message').fill(draft);await page.evaluate(()=>location.hash='#learn');
  await page.getByLabel('An idea or passage',{exact:true}).fill(topic);
  await page.getByRole('slider',{name:/Move the Moon/}).fill('217');
  await page.getByRole('button',{name:'Let me explain it back',exact:true}).click();await page.getByRole('textbox',{name:'In your own words',exact:true}).fill(explanation);
  if(action==='Continue in conversation')await page.getByRole('button',{name:'Make my recap',exact:true}).click();
  const handoff=page.getByRole('button',{name:action,exact:true});await handoff.click();
  await expect(page.locator('body')).toHaveAttribute('data-view','learn');
  await expect(page.getByLabel('An idea or passage',{exact:true})).toHaveValue(topic);await expect(page.getByRole('textbox',{name:'In your own words',exact:true})).toHaveValue(explanation);
  await expect(page.locator('.eact-moon output')).toHaveText('217°');await expect(page.locator('#message')).toHaveValue(draft);
  await expect(page.locator('#conversation .message.user')).toHaveCount(0);await expect(page.locator('#recent-chats button')).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('AI connection is not ready');expect(chats).toHaveLength(0);
  expect(await page.evaluate(()=>statusStartup.released)).toBe(false);
  await page.evaluate(()=>releaseInitialStatus());await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await expect(page.locator('body')).toHaveAttribute('data-view','learn');await expect(page.locator('#message')).toHaveValue(draft);
  await handoff.click();await expect(page.locator('body')).toHaveAttribute('data-view','conversation');
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toContainText(action==='Explore with NOX'?topic:explanation);
  expect(chats).toHaveLength(1);expect(await page.evaluate(()=>statusStartup.requests)).toBe(1);
});
