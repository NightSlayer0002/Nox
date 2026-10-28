import {test,expect} from '@playwright/test';

for(const width of [430,1440])test(`reading position survives streamed chunks and final reveal at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.addInitScript(()=>{
    const original=window.fetch;
    window.fetch=(url,options)=>{
      if(url==='/api/chat'&&JSON.parse(options.body).message==='CI controlled stream'){
        const encoder=new TextEncoder();let text='Earlier reading. '.repeat(160),stream;
        const emit=(event,value)=>stream.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));
        const body=new ReadableStream({start(controller){stream=controller;emit('text',{speech:text});}});
        window.ciChunk=()=>{const delta='More reasoning. '.repeat(100);text+=delta;emit('text',{delta});};
        window.ciFinish=()=>{emit('final',{speech:text+'Final decision.',emotion:'curious',action:'none',memory:''});stream.close();};
        return Promise.resolve(new Response(body,{headers:{'content-type':'text/event-stream'}}));
      }
      return original(url,options);
    };
  });
  await page.goto('/guest#conversation');await expect(page.locator('#brain-status')).toContainText('Guest visit');
  const voice=page.locator('#composer-voice');if(await voice.getAttribute('aria-pressed')==='true')await voice.click();
  await page.locator('#message').fill('CI controlled stream');await page.locator('#send-button').click();
  const answer=page.locator('#conversation .message.nox .message-content');await expect(answer).toContainText('Earlier reading.');
  const conversation=page.locator('#conversation');
  await conversation.evaluate(node=>{node.scrollTop=100;});
  await conversation.focus();await expect(conversation).toBeFocused();
  await expect(page.locator('#latest-reply')).toBeVisible();
  const top=await conversation.evaluate(node=>node.scrollTop);
  await page.evaluate(()=>ciChunk());await expect(answer).toContainText('More reasoning.');
  expect(Math.abs(await conversation.evaluate(node=>node.scrollTop)-top)).toBeLessThan(3);
  await page.evaluate(()=>ciFinish());await expect(page.locator('#cancel-reply')).toBeHidden();
  await expect(answer).toContainText('Final decision.');
  await expect(conversation).toBeFocused();
  expect(Math.abs(await conversation.evaluate(node=>node.scrollTop)-top)).toBeLessThan(3);
  await page.locator('#latest-reply').focus();await page.keyboard.press('Enter');
  await expect(page.locator('#latest-reply')).toBeHidden();
  await expect.poll(()=>conversation.evaluate(node=>node.scrollHeight-node.scrollTop-node.clientHeight)).toBeLessThan(3);
});
