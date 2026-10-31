import {test,expect} from '@playwright/test';

for(const failure of ['encoder','empty'])test(`${failure} capture failure remains visible in Afterimage after the toast disappears`,async({page})=>{
  // Question: Does actual recorder→app→bridge→React wiring retain actionable capture failure in the receiver?
  // Limits: Native Chromium UI and canvas with a synthetic MediaRecorder failure; not real codec support, clip quality or physical-phone capture.
  await page.addInitScript(()=>{
    window.ciEncoders=[];window.MediaRecorder=class{
      static isTypeSupported(){return true;}
      constructor(){this.state='inactive';ciEncoders.push(this);}start(){this.state='recording';}stop(){this.state='inactive';queueMicrotask(()=>this.onstop?.());}
    };
  });
  await page.goto('/guest#afterimage');await expect(page.getByRole('button',{name:'Capture performance',exact:true})).toBeEnabled();
  const voiceOn=page.getByRole('button',{name:'Voice on',exact:true});if(await voiceOn.count())await voiceOn.click();await page.clock.install();
  await page.getByRole('button',{name:'Capture performance',exact:true}).click();await expect.poll(()=>page.evaluate(()=>ciEncoders.length)).toBe(1);
  await page.evaluate(failure=>{const encoder=ciEncoders[0];encoder.state='inactive';if(failure==='encoder')encoder.onerror();else encoder.onstop();},failure);
  const error=page.locator('.receiver-error');await expect(error).toContainText('could not be saved');await expect(page.locator('.receiver-notice')).not.toContainText('Capturing NOX locally');
  await page.clock.fastForward(7000);await expect(page.locator('#toast')).toBeHidden();await expect(error).toContainText('Try recording again');
  await expect(page.locator('.receiver-notice')).not.toContainText('Capturing NOX locally');await expect(page.getByRole('button',{name:'Capture performance',exact:true})).toBeEnabled();
  // Question: does an earlier capture failure obscure the next ordinary playback?
  // Limits: synthetic encoder and Chromium fallback, not real recording or GPU quality.
  await page.getByRole('button',{name:'Play this cut',exact:true}).click();
  await expect(page.locator('.receiver-state')).toContainText('Playing');
  await expect(page.locator('.receiver-notice')).toContainText(/performing|Playing with captions only/);
  await expect(error).toBeVisible();
});
