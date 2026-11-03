import {test,expect} from '@playwright/test';
import {createBrowserTestServer} from '../../scripts/browser-test-server.mjs';

// Question: can ordinary route and source-panel navigation leave both speakers
// readable without requiring a drag, Park, gravity, or Hide NOX?
// Limits: synthetic text on Chromium's Canvas fallback, not live model quality,
// physical touch/keyboard behavior, or GPU rendering.
let server,origin;
test.beforeAll(async()=>{
  server=createBrowserTestServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});

async function intersections(page){
  return page.evaluate(()=>{
    const handle=document.querySelector('.floating-nox-handle').getBoundingClientRect();
    const viewport=document.getElementById('conversation').getBoundingClientRect();
    return [...document.querySelectorAll('#conversation .message')].flatMap(message=>{
      const content=message.querySelector('.message-content'),walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT),hits=[];
      while(walker.nextNode()){
        if(!walker.currentNode.textContent.trim())continue;
        const range=document.createRange();range.selectNodeContents(walker.currentNode);
        for(const rect of range.getClientRects()){
          let left=Math.max(rect.left,viewport.left),right=Math.min(rect.right,viewport.right),top=Math.max(rect.top,viewport.top),bottom=Math.min(rect.bottom,viewport.bottom);
          // Code can scroll inside its own box. Hidden glyphs beyond that box
          // cannot obscure the character, even if their Range extends into it.
          for(let parent=walker.currentNode.parentElement;parent&&parent!==message.parentElement;parent=parent.parentElement){
            const style=getComputedStyle(parent),clip=parent.getBoundingClientRect();
            if(style.overflowX!=='visible'){left=Math.max(left,clip.left);right=Math.min(right,clip.right);}
            if(style.overflowY!=='visible'){top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom);}
          }
          if(right>left&&bottom>top&&bottom>handle.top&&top<handle.bottom&&right>handle.left&&left<handle.right)hits.push({role:message.classList.contains('user')?'user':'nox',text:walker.currentNode.textContent.slice(0,60),top,right,handle:{left:handle.left,top:handle.top,bottom:handle.bottom}});
        }
      }
      return hits;
    });
  });
}

test('automatic placement clears both roles after routes and closing code preparation',async({page})=>{
  await page.setViewportSize({width:1188,height:761});
  await page.goto(`${origin}/guest#conversation`);
  await expect(page.locator('#brain-status')).toContainText('Guest visit');
  for(const [index,text] of ['I want a tiny weekly letter for people tired of improving themselves. Keep me company while I work out its shape.','No assignments or progress reports. Please keep it under one hundred words.','Could I promise that everyone will become creative again within a week?'].entries()){
    await page.locator('#message').fill(text);await page.locator('#send-button').click();
    await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(index+1);
  }
  for(const route of ['library','discover','afterimage']){
    await page.locator(`a[href="#${route}"]`).first().click();
    await expect(page.locator('body')).toHaveAttribute('data-view',route);
  }
  await page.locator('#settings-button').click();await page.locator('#close-inside').click();
  await page.locator('a[href="#conversation"]').first().click();
  await page.locator('#prepare-code-nav').click();await page.locator('#rehearsal-example').click();
  await expect(page.locator('#rehearsal-range')).toHaveText('Lines 1–8 of 15');
  await page.locator('#rehearsal-close').click();
  await expect.poll(()=>intersections(page)).toEqual([]);
  expect(await page.locator('#conversation').evaluate(node=>node.scrollHeight)).toBeLessThan(2000);
});

async function navigate(page,route){
  // Narrow layouts expose a different subset of links. Exercise their real
  // hash route handler here; the desktop regression above clicks the audit path.
  await page.evaluate(route=>{location.hash=route;},route);
  await expect(page.locator('body')).toHaveAttribute('data-view',route);
}

async function readingGeometry(page){
  return page.evaluate(()=>{
    const rect=node=>{const {left,right,top,bottom,width,height}=node.getBoundingClientRect();return {left,right,top,bottom,width,height};};
    return {character:rect(document.querySelector('.floating-nox-handle')),composer:rect(document.getElementById('chat-form')),column:rect(document.getElementById('conversation')),
      messages:[...document.querySelectorAll('#conversation .message')].map(message=>{
        const content=message.querySelector('.message-content'),style=getComputedStyle(content);
        return {role:message.classList.contains('user')?'user':'nox',bodyWidth:content.getBoundingClientRect().width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),gutter:message.style.marginInlineEnd};
      })};
  });
}

for(const width of [562,390,320])test(`long prose and code keep a stable gutter through route and panel returns at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:800});
  await page.route('**/api/chat',route=>route.fulfill({json:{speech:`${'A longer paragraph stays readable as the conversation scrolls. '.repeat(16)}\n\n\`\`\`js\nfunction total(items) {\n  return items.reduce((sum, item) => sum + item.price, 0);\n}\n\`\`\``,emotion:'curious',action:'none',memory:''}}));
  await page.goto(`${origin}/guest#conversation`);await expect(page.locator('#brain-status')).toContainText('Guest visit');
  for(const [index,text] of ['Please read this longer user thought. '.repeat(12),'Can we look at the code and keep its explanation readable? '.repeat(8)].entries()){
    await page.locator('#message').fill(text);await page.locator('#send-button').click();
    await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(index+1);
  }
  for(const route of ['library','discover','afterimage','scenes','memory','access']){
    await navigate(page,route);await navigate(page,'conversation');
    await expect.poll(()=>intersections(page),{message:`clear transcript after ${route}`}).toEqual([]);
  }
  for(let pass=0;pass<2;pass++){
    await page.evaluate(()=>{location.hash='prepare-code';});
    await expect(page.locator('#rehearsal-panel')).toBeVisible();
    if(!pass)await page.locator('#rehearsal-example').click();
    await expect.poll(()=>intersections(page)).toEqual([]);
    await page.locator('#rehearsal-close').click();
    for(const role of ['user','nox']){
      await page.locator(`#conversation .message.${role}`).last().evaluate(message=>{
        const conversation=document.getElementById('conversation'),handle=document.querySelector('.floating-nox-handle').getBoundingClientRect();
        conversation.scrollTop+=message.getBoundingClientRect().top-handle.top;
      });
      await expect.poll(()=>intersections(page),{message:`clear ${role} after panel close`}).toEqual([]);
    }
  }
  const height=await page.locator('#conversation').evaluate(node=>node.scrollHeight);
  await page.locator('#conversation').evaluate(node=>node.scrollTop=0);
  await expect.poll(()=>intersections(page)).toEqual([]);
  // No float may create a growing blank region while following the transcript.
  await expect.poll(()=>page.locator('#conversation').evaluate(node=>node.scrollHeight)).toBe(height);
  // Question: after the same route/source returns, does clearance still leave
  // a useful prose measure instead of a technically unobscured word column?
  // Limits: CSS content-box width, not comprehension or physical-device type rendering.
  const geometry=await readingGeometry(page);
  for(const message of geometry.messages)expect(message.bodyWidth,JSON.stringify({...geometry,measured:message})).toBeGreaterThanOrEqual(width===320?144:160);
  await test.info().attach('reading-geometry',{body:JSON.stringify(geometry,null,2),contentType:'application/json'});
  if(width<=390){
    await page.screenshot({path:`artifacts/nov02-mobile-reading-${width}.png`});
    await page.locator('#conversation .message.nox').last().evaluate(message=>{const conversation=document.getElementById('conversation');conversation.scrollTop+=message.getBoundingClientRect().top-conversation.getBoundingClientRect().top;});
    await expect.poll(()=>intersections(page)).toEqual([]);
    await page.screenshot({path:`artifacts/nov02-mobile-reading-${width}-nox.png`});
  }
});

test('deliberate placement and Park retain free overlay after code preparation closes',async({page})=>{
  await page.setViewportSize({width:1188,height:761});await page.goto(`${origin}/guest#conversation`);
  await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await page.locator('#message').fill('CI long reading');await page.locator('#send-button').click();
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(1);
  const handle=page.locator('.floating-nox-handle');await handle.focus();await page.keyboard.press('ArrowLeft');
  const before=await handle.boundingBox();
  await page.locator('#prepare-code-nav').click();await page.locator('#rehearsal-close').click();
  await expect.poll(()=>handle.boundingBox()).toEqual(before);
  await expect.poll(()=>page.locator('#conversation .message').evaluateAll(nodes=>nodes.every(node=>!node.style.marginInlineEnd&&!node.style.maxInlineSize))).toBe(true);
  await page.locator('#presence-menu summary').click();await page.getByRole('button',{name:'Park NOX',exact:true}).click();
  await expect.poll(()=>page.locator('#conversation .message').evaluateAll(nodes=>nodes.every(node=>!node.style.marginInlineEnd&&!node.style.maxInlineSize))).toBe(true);
  const parked=await handle.boundingBox();expect(parked.y).toBeGreaterThan(before.y);
});
