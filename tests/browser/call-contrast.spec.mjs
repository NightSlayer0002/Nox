import {test,expect} from '@playwright/test';

for(const theme of ['dark','light'])test(`End call text retains readable contrast in the actual ${theme} theme`,async({page})=>{
  // Uncertainty: do the rendered colors meet the 4.5:1 body-text floor in this
  // theme? No microphone, screen-reader, forced-colors or complete accessibility claim.
  await page.setViewportSize({width:430,height:900});await page.goto('/guest#conversation');
  await expect(page.locator('#brain-status')).toContainText('Guest visit');
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);await page.locator('#call-button').click();
  const end=page.locator('#voice-call-end');await expect(end).toBeVisible();
  const contrast=await end.evaluate(node=>{
    const rgba=color=>color.match(/[\d.]+/g).map(Number);
    const over=(top,bottom)=>{const a=top[3]??1,b=bottom[3]??1,alpha=a+b*(1-a);return [...top.slice(0,3).map((v,i)=>(v*a+bottom[i]*b*(1-a))/alpha),alpha];};
    let background=[0,0,0,0];
    for(let element=node;element;element=element.parentElement){background=over(background,rgba(getComputedStyle(element).backgroundColor));if(background[3]>=.999)break;}
    const foreground=over(rgba(getComputedStyle(node).color),background);
    const luminance=color=>color.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const a=luminance(foreground),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({path:`artifacts/audit28-call-${theme}.png`});
});
