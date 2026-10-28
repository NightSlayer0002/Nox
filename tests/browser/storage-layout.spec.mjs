import {test,expect} from '@playwright/test';
import {FIRST_CONTACT} from '../../client/afterimage-example.js';
import {readFile} from 'node:fs/promises';

test('real same-origin tabs serialize notebook and story mutations without reviving deleted items',async({context,page})=>{
  const second=await context.newPage();await Promise.all([page.goto('/guest#conversation'),second.goto('/guest#conversation')]);
  for(const tab of [page,second])await tab.evaluate(async()=>{
    const {createKnowledge}=await import('/js/knowledge.js');const {createAfterimageStore}=await import('/js/afterimage-store.js');
    window.ciNotes=createKnowledge(localStorage);window.ciStories=createAfterimageStore(localStorage);
  });
  const note=await page.evaluate(()=>ciNotes.add({title:'Delete this fixture',text:'A fictional notebook entry.'}));
  const story=await page.evaluate(packet=>ciStories.add({packet,seed:'A synthetic door',tone:'wonder',source:'authored'}),FIRST_CONTACT);
  await second.evaluate(()=>{ciNotes.list();ciStories.list();});
  await Promise.all([page.evaluate(id=>ciNotes.remove(id),note.id),second.evaluate(()=>ciNotes.setEnabled(false))]);
  await Promise.all([page.evaluate(id=>ciStories.remove(id),story.id),second.evaluate(packet=>ciStories.add({packet:{...packet,title:'Surviving fixture'},seed:'Another synthetic door',tone:'wonder',source:'authored'}),FIRST_CONTACT)]);
  for(const tab of [page,second])expect(await tab.evaluate(()=>({notes:ciNotes.list().length,enabled:ciNotes.enabled,stories:ciStories.list().map(story=>story.packet.title)}))).toEqual({notes:0,enabled:false,stories:['Surviving fixture']});
});

test('source titles survive fresh replies, owner reload and the actual archive download',async({page})=>{
  // This local synthetic server has no owner secret or real provider. The /app
  // path exercises persistent-owner behavior, never production authentication.
  await page.goto('/app#conversation');await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
  await page.evaluate(async()=>{const {knowledge}=await import('/js/workbench.js');await knowledge.add({title:'Lumen Harbor fixture',text:'Lumen Harbor is a fictional violet lighthouse with seven bells. The Lumen Harbor keeper is Mira.'});});
  await page.locator('#message').fill('Who keeps Lumen Harbor and how many bells does Lumen Harbor have?');await page.locator('#send-button').click();
  const label=page.locator('#conversation .message.nox .knowledge-sources');await expect(label).toContainText('Lumen Harbor fixture');
  await page.reload();await expect(label).toContainText('Lumen Harbor fixture');
  await page.locator('a[href="#library"]').first().click();const downloading=page.waitForEvent('download');await page.locator('#export-history').click();
  const download=await downloading,archive=JSON.parse(await readFile(await download.path(),'utf8'));
  const assistant=archive.threads.flatMap(thread=>thread.turns).find(turn=>turn.role==='assistant');
  expect(assistant.sources).toEqual([{id:expect.any(String),title:'Lumen Harbor fixture'}]);
  expect(JSON.stringify(assistant.sources)).not.toContain('seven bells');
});

test('narrow untouched chat reserves reading space and deliberate movement restores free overlay',async({page})=>{
  await page.setViewportSize({width:562,height:800});await page.goto('/guest#conversation');
  await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await page.locator('#message').fill('CI long reading');await page.locator('#send-button').click();
  await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(1);
  await expect.poll(()=>page.locator('#conversation .message').evaluateAll(nodes=>nodes.some(node=>parseFloat(node.style.marginInlineEnd)>0||node.hasAttribute('data-presence-clearance')))).toBe(true);
  // Following and character clearance settle through real resize/scroll events.
  // Wait for the actual reading invariant, not only the first clearance style.
  await expect.poll(()=>page.evaluate(()=>{
    const handle=document.querySelector('.floating-nox-handle').getBoundingClientRect();
    return [...document.querySelectorAll('#conversation .message')].flatMap(node=>{
      const walker=document.createTreeWalker(node.querySelector('.message-content'),NodeFilter.SHOW_TEXT),rects=[];
      // Structured answers contain block boxes as well as glyphs. Only actual
      // text rectangles establish whether NOX obscures the reading surface.
      while(walker.nextNode()){if(!walker.currentNode.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(walker.currentNode);rects.push(...range.getClientRects());}
      return rects.filter(rect=>rect.bottom>handle.top&&rect.top<handle.bottom&&rect.width>0&&rect.right>handle.left).map(rect=>({right:rect.right,left:handle.left}));
    });
  })).toEqual([]);
  await page.locator('.floating-nox-handle').focus();await page.keyboard.press('ArrowLeft');
  await expect.poll(()=>page.locator('#conversation .message').evaluateAll(nodes=>nodes.every(node=>!node.style.marginInlineEnd&&!node.hasAttribute('data-presence-clearance')))).toBe(true);
});

test('WebGL-disabled homepage keeps fallback art separate from feature copy and its action',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...options){return /^webgl/.test(kind)?null:original.call(this,kind,...options);};});
  await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-home-ready','true');
  await page.locator('#features').scrollIntoViewIfNeeded();
  for(const fallback of await page.locator('.contact-emblem .logo-static').all())await expect(fallback).toBeHidden();
  const slot=page.locator('#features .mobile-emblem-slot');await expect(slot).toBeVisible();
  const art=await slot.boundingBox();
  for(const element of [page.locator('#features .contact-description'),page.locator('#features .contact-actions')]){
    const box=await element.boundingBox();expect(art.x+art.width<=box.x||box.x+box.width<=art.x||art.y+art.height<=box.y||box.y+box.height<=art.y).toBe(true);
  }
  await page.getByRole('button',{name:'Say hello',exact:true}).click();
});

for(const width of [1440,1024,562,390])test(`untouched NOX leaves both roles readable in fresh and restored history at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.goto('/app#conversation');
  await expect(page.locator('#brain-status')).toContainText('Synthetic CI provider');
  for(const [index,text] of ['CI long reading','Here is a longer user message. '.repeat(12),'Please keep the entire conversation readable. '.repeat(10)].entries()){
    await page.locator('#message').fill(text);await page.locator('#send-button').click();
    await expect(page.locator('#conversation .message.nox:not(.draft)')).toHaveCount(index+1);
  }
  for(const restored of [false,true]){
    if(restored){await page.reload();await expect(page.locator('#conversation .message.user')).toHaveCount(3);}
    for(const selector of ['.message.user','.message.nox']){
      await page.locator(`#conversation ${selector}`).nth(1).evaluate(message=>{
        const conversation=document.getElementById('conversation'),handle=document.querySelector('.floating-nox-handle').getBoundingClientRect();
        conversation.scrollTop+=message.getBoundingClientRect().top-handle.top;
      });
      await expect.poll(()=>page.evaluate(()=>{
        const handle=document.querySelector('.floating-nox-handle').getBoundingClientRect(),viewport=document.getElementById('conversation').getBoundingClientRect();
        return [...document.querySelectorAll('#conversation .message-content')].flatMap(content=>{
          const walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT),rects=[];
          while(walker.nextNode()){if(!walker.currentNode.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(walker.currentNode);rects.push(...range.getClientRects());}
          return rects.filter(rect=>rect.width>0&&rect.height>0&&rect.bottom>viewport.top&&rect.top<viewport.bottom&&rect.bottom>handle.top&&rect.top<handle.bottom&&rect.right>handle.left&&rect.left<handle.right).map(rect=>({left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}));
        });
      }),{message:`Text must clear the untouched character (${restored?'restored':'fresh'} ${selector})`}).toEqual([]);
    }
  }
  await page.screenshot({path:`artifacts/audit-repair-2026-10-24/chat-${width}.png`});
});
