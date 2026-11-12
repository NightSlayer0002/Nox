import {test,expect} from '@playwright/test';

function mediaDouble(){
  window.catMedia=[];
  window.Audio=class {
    constructor(src){this.src=src;this.paused=true;window.catMedia.push(this);}
    play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){this.src='';}load(){}
  };
}

// Question: is the cat opt-in, interactive, removable, and carried into the
// workspace as a UI preference? Limits: no live model, microphone or GPU proof.
test('Calm mode adds one pet and preserves the preference across navigation',async({page})=>{
  await page.goto('/');const toggle=page.locator('.calm-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed','false');await expect(page.locator('.calm-cat')).toHaveCount(0);
  await toggle.click();await expect(page.locator('.calm-cat')).toHaveCount(1);
  await page.getByRole('button',{name:'Pet the cat',exact:true}).click();
  await expect(page.locator('.calm-cat')).toHaveAttribute('data-pose','nuzzle');
  await expect(page.locator('.calm-cat-heart')).toBeVisible();
  await expect(page.locator('.calm-cat')).toHaveAttribute('data-pose','idle',{timeout:4000});
  await page.goto('/guest#conversation');await expect(page.locator('.calm-cat')).toHaveCount(1);
  const header=page.locator('#calm-header .calm-toggle');await expect(header).toBeVisible();
  await expect(header).toHaveAttribute('aria-pressed','true');
  await header.click();await expect(page.locator('.calm-cat')).toHaveCount(0);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const settings=page.locator('#inside-dialog');
  await expect(settings.locator('.calm-toggle')).toHaveAttribute('aria-pressed','false');
  await settings.locator('.calm-toggle').click();await expect(page.locator('.calm-cat')).toHaveCount(1);
  await expect(header).toHaveAttribute('aria-pressed','true');
  await page.locator('#close-inside').click();await expect(page.locator('#message')).toBeVisible();
});

// Question: can petting a sleeping cat jump directly to sitting, or can an old
// routine timer override the reaction? Limits: accelerated browser time and
// sprite state; does not establish physical-device animation smoothness.
test('a sleeping cat wakes before nuzzling and a new visit has no old reaction timer',async({page})=>{
  await page.goto('/');await page.clock.install();await page.locator('.calm-toggle').click();
  const cat=page.locator('.calm-cat');
  for(const [duration,pose] of [[2500,'walk'],[3000,'idle'],[6000,'grooming'],[4000,'walk'],[3000,'idle'],[8000,'curious'],[2500,'idle'],[5000,'stretching'],[2000,'laying'],[1500,'sleeping1']]){
    await page.clock.fastForward(duration);await expect(cat).toHaveAttribute('data-pose',pose);
  }
  await page.getByRole('button',{name:'Pet the cat',exact:true}).click();
  await expect(cat).toHaveAttribute('data-pose','waking');
  await page.clock.fastForward(2000);await expect(cat).toHaveAttribute('data-pose','nuzzle');
  await page.clock.fastForward(3000);await expect(cat).toHaveAttribute('data-pose','idle');
  await page.getByRole('button',{name:'Pet the cat',exact:true}).click();
  await page.locator('.calm-toggle').click();await page.locator('.calm-toggle').click();
  await page.clock.fastForward(1500);await expect(cat).toHaveAttribute('data-pose','idle');
});

// Question: does reduced motion keep the cat still but preserve visible pet
// feedback and controls? Limits: media preference emulation, not user comfort.
test('reduced motion keeps a still cat with gentle affection feedback',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await page.locator('.calm-toggle').click();await page.getByRole('button',{name:'Pet the cat',exact:true}).click();
  await expect(page.locator('.calm-cat-heart')).toBeVisible();
  expect(await page.locator('.calm-cat-sprite').evaluate(node=>getComputedStyle(node).animationName)).toBe('none');
  expect(await page.locator('.calm-cat-walk').evaluate(node=>getComputedStyle(node).transitionDuration)).toBe('0s');
  // Explicit opt-in should animate just the cat without changing the OS media
  // preference or other page effects. This cannot establish user comfort.
  await page.getByRole('button',{name:'Animate cat',exact:true}).click();
  const sprite=page.locator('.calm-cat-sprite');
  const first=await sprite.evaluate(node=>getComputedStyle(node).backgroundPositionX);
  await expect.poll(()=>sprite.evaluate(node=>getComputedStyle(node).backgroundPositionX)).not.toBe(first);
  expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await page.getByRole('button',{name:'Pause cat animation',exact:true}).click();
  expect(await sprite.evaluate(node=>getComputedStyle(node).animationName)).toBe('none');
});

// Question: do sprites advance in real time, and does the cat visibly walk in
// both directions on its interface perch? Limits: Chromium rendering without
// a physical phone, GPU benchmark, or assumptions about the user's OS settings.
for(const [label,width,path] of [['landing',390,'/'],['chat',1440,'/guest#conversation']]){
  test(`cat walks, turns and animates on the ${label} perch`,async({page})=>{
    await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
    await page.goto(path);const paw=page.locator(path==='/'?'.calm-toggle':'#calm-header .calm-toggle');
    await expect(paw).toHaveAccessibleName('Cat companion');expect((await paw.textContent()).trim()).toBe('');
    await paw.click();const cat=page.locator('.calm-cat'),walker=cat.locator('.calm-cat-walk'),sprite=cat.locator('.calm-cat-sprite');
    const firstFrame=await sprite.evaluate(node=>getComputedStyle(node).backgroundPositionX);
    await expect.poll(()=>sprite.evaluate(node=>getComputedStyle(node).backgroundPositionX)).not.toBe(firstFrame);
    const start=await walker.boundingBox();
    await expect.poll(async()=>(await walker.boundingBox()).x,{timeout:6500}).toBeGreaterThan(start.x+45);
    await expect.poll(()=>cat.evaluate(node=>node.style.getPropertyValue('--cat-facing'))).toBe('-1');
    await expect.poll(()=>cat.evaluate(node=>node.style.getPropertyValue('--cat-facing')),{timeout:15000}).toBe('1');
    await expect.poll(async()=>(await walker.boundingBox()).x,{timeout:4500}).toBeLessThan(start.x+2);
    const end=await walker.boundingBox();expect(end.x).toBeGreaterThanOrEqual(0);expect(end.x+end.width).toBeLessThanOrEqual(width);
  });
}

// Question: does the cat stay on the composer without consuming a draft, and
// do voice/call states mute its audio? Limits: media and keyboard height are
// simulated; physical-phone keyboards and audible sound remain separate.
test('mobile cat stays on its rail and yields audio to NOX',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.addInitScript(mediaDouble);
  await page.goto('/guest#conversation');await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('#inside-dialog .calm-toggle').click();await page.locator('#inside-dialog .calm-sound').click();await page.locator('#close-inside').click();
  await page.locator('#message').fill('Keep this unfinished thought.');
  // Autosizing the textarea schedules a ResizeObserver and a render frame.
  // Assert the same precise alignment after that observed layout has settled.
  const pawLineOffset=async()=>{
    const button=await page.locator('.calm-cat-pet').boundingBox();
    const composer=await page.locator('#chat-form').boundingBox();
    return Math.abs(button.y+button.height-composer.y);
  };
  await expect.poll(pawLineOffset).toBeLessThan(2);
  const frame=await page.locator('.calm-cat').boundingBox();expect(frame.x+frame.width).toBeLessThanOrEqual(390);
  await page.evaluate(()=>document.body.dataset.voiceState='speaking');
  await expect.poll(()=>page.evaluate(()=>window.catMedia.every(a=>a.paused))).toBe(true);
  await page.evaluate(()=>document.body.dataset.voiceState='idle');
  await expect.poll(()=>page.evaluate(()=>window.catMedia.some(a=>!a.paused))).toBe(true);
  await page.evaluate(()=>document.body.dataset.callOpen='true');
  await expect.poll(()=>page.evaluate(()=>window.catMedia.every(a=>a.paused))).toBe(true);
  await page.setViewportSize({width:390,height:520});
  await expect.poll(pawLineOffset).toBeLessThan(2);
  await expect(page.locator('#message')).toHaveValue('Keep this unfinished thought.');
  await expect(page.locator('#chat-form')).toBeInViewport();
});

// Question: can a narrow-screen user find and toggle Calm mode directly from
// the header, without opening Settings or losing a draft? Limits: Chromium
// viewport layout, not physical touch ergonomics or browser update delivery.
test('chat header paw is directly accessible at 320px',async({page})=>{
  await page.setViewportSize({width:320,height:760});await page.goto('/guest#conversation');
  await page.locator('#message').fill('An unfinished message.');
  const paw=page.locator('#calm-header .calm-toggle');await expect(paw).toBeVisible();
  const rect=await paw.boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await paw.click();await expect(page.locator('.calm-cat')).toHaveCount(1);
  await paw.click();await expect(page.locator('.calm-cat')).toHaveCount(0);
  await expect(page.locator('#message')).toHaveValue('An unfinished message.');
});

// Question: are the actual recorded files served as decodable WAVs and an
// autoplay rejection recoverable? Limits: HTTP bytes and substituted rejection,
// not subjective sound quality or acoustic hardware.
test('cat sounds have a real media route and failures leave the control muted',async({page,request})=>{
  for(const sound of ['purr-soft','mew-hello','mew-soft']){
    const response=await request.get(`/assets/calm/${sound}.wav`);expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('audio/wav');expect((await response.body()).subarray(0,4).toString()).toBe('RIFF');
  }
  await page.addInitScript(()=>{window.Audio=class {play(){return Promise.reject(Error('blocked'));}pause(){}removeAttribute(){}load(){}};});
  await page.goto('/');await page.locator('.calm-toggle').click();await page.locator('.calm-sound').click();
  await expect(page.locator('.calm-sound')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('.calm-controls [role=status]')).toContainText('could not play');
  await expect(page.locator('.calm-cat')).toBeVisible();
});
