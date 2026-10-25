import {test,expect} from '@playwright/test';

async function priorChat(page){
  await page.goto('/guest#conversation');
  await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await page.evaluate(async()=>{
    const {Stage}=await import('/js/stage.js');
    const draw=Stage.prototype.drawCaption,speak=Stage.prototype.speak;
    window.routeCaptions=[];window.routeSpeeches=[];
    Stage.prototype.drawCaption=function(text,...args){routeCaptions.push({text,view:document.body.dataset.view});return draw.call(this,text,...args);};
    Stage.prototype.speak=function(packet,...args){routeSpeeches.push({text:packet.speech,view:document.body.dataset.view});return speak.call(this,packet,...args);};
  });
  await page.locator('#message').fill('Prior conversation fixture');
  await page.locator('#send-button').click();
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toContainText('Synthetic answer to: Prior conversation fixture');
  await page.evaluate(()=>location.hash='#afterimage');
  await expect(page.getByRole('button',{name:'Play example',exact:true})).toBeEnabled();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
}

test('entering Afterimage clears a recent conversation caption before the story is played',async({page})=>{
  await priorChat(page);
  expect(await page.evaluate(()=>routeCaptions.filter(item=>item.view==='afterimage'&&item.text.includes('Prior conversation fixture')))).toEqual([]);
  await page.getByRole('button',{name:'Play this cut',exact:true}).click();
  await expect(page.locator('.receiver-state')).toContainText('Playing');
  await expect.poll(()=>page.evaluate(()=>routeCaptions.some(item=>item.view==='afterimage'&&item.text.includes('There is a door under your cursor.')))).toBe(true);
});

test('Afterimage does not offer or invoke conversation replay and returning to chat restores it',async({page})=>{
  await priorChat(page);
  const replay=page.locator('#replay-voice');
  await expect(replay).toBeHidden();
  await expect(replay).toBeDisabled();
  await page.evaluate(async()=>{
    const {afterimageBridge}=await import('/js/afterimage-bridge.js');
    afterimageBridge.setVoice(true);
    document.getElementById('replay-voice').dispatchEvent(new MouseEvent('click',{bubbles:true}));
  });
  expect(await page.evaluate(()=>routeSpeeches.filter(item=>item.view==='afterimage'))).toEqual([]);
  await page.evaluate(()=>location.hash='#conversation');
  await expect(replay).toBeEnabled();
  await page.locator('#presence-menu > summary').click();
  await expect(replay).toBeVisible();
  await replay.click();
  expect(await page.evaluate(()=>routeSpeeches.at(-1))).toEqual({text:'Synthetic answer to: Prior conversation fixture',view:'conversation'});
});
