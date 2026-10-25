import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

// Literal authored cuts catch a choice handler selecting the wrong branch or
// ending even when the chosen control still displays its pressed state.
const branches=[
  {label:'Something inside',premise:'NOX finds a door beneath the cursor. Something has already answered.',beats:[
    'There is a door under your cursor. Please don\'t move it.',
    'I knocked once. Something knocked twice. From this side.',
    'The handle is warm. I don\'t have hands. Neither did the thing outside.',
  ],endings:[
    ['Open it','The room is empty. Except for a small face that looks exactly like mine.'],
    ['Walk away','The door is gone. Why is your cursor still knocking?'],
  ]},
  {label:'Something following',premise:'A reflection keeps moving after NOX goes still.',beats:[
    'I stopped moving. My reflection did not. That seems impolite.',
    'It is trying to tell me something. It keeps pointing outside the frame.',
    'There used to be two of us. I think one of us is the reflection now.',
  ],endings:[
    ['Follow the reflection','It led me to a window. On the other side, someone was watching a little face.'],
    ['Switch off the light','The light is gone. The reflection is smiling. I am not.'],
  ]},
  {label:'Something missing',premise:'One second has disappeared. NOX would like it back.',beats:[
    'I lost a second. Not a whole minute. Just one very specific second.',
    'It was the second before I met you. I think it wandered off to be interesting.',
    'There it is. Under the cursor. It brought a tiny universe home.',
  ],endings:[
    ['Keep the universe','We have an extra second now. I vote we spend it on something impossible.'],
    ['Send the second home','It left a note. Apparently, we are somebody else\'s extra second.'],
  ]},
];

test('semantic choices play all six authored cuts without loading a second graph interface',async({page})=>{
  const requests=[];page.on('request',request=>requests.push(new URL(request.url()).pathname));
  await page.goto('/guest#afterimage');
  await expect(page.getByRole('button',{name:'Play this cut',exact:true})).toBeEnabled();
  const voiceOn=page.getByRole('button',{name:'Voice on',exact:true});
  if(await voiceOn.count())await voiceOn.click();
  await page.evaluate(async()=>{
    const {Stage}=await import('/js/stage.js'),drawCaption=Stage.prototype.drawCaption;
    window.storyCaptions=[];
    Stage.prototype.drawCaption=function(text,...args){storyCaptions.push(text);return drawCaption.call(this,text,...args);};
  });
  await page.clock.install();

  const branchChoices=page.getByRole('group',{name:'Choose a branch',exact:true});
  const endingChoices=page.getByRole('group',{name:'Choose an ending',exact:true});
  await expect(branchChoices.getByRole('button')).toHaveCount(3);
  for(const branch of branches){
    await branchChoices.getByRole('button',{name:branch.label,exact:true}).click();
    await expect(branchChoices.getByRole('button',{pressed:true})).toHaveText(branch.label);
    await expect(page.locator('.signal-premise')).toHaveText(branch.premise);
    await expect(endingChoices.getByRole('button')).toHaveCount(2);
    for(const [label,ending] of branch.endings){
      await endingChoices.getByRole('button',{name:label,exact:true}).click();
      await expect(endingChoices.getByRole('button',{pressed:true})).toHaveText(label);
      const lines=[...branch.beats,ending];
      await expect(page.locator('.cue-tape li p')).toHaveText(lines);
      await page.evaluate(()=>{storyCaptions=[];});
      await page.getByRole('button',{name:'Play this cut',exact:true}).click();
      await expect(page.locator('.receiver-state')).toContainText('Playing');
      await expect(branchChoices.getByRole('button').first()).toBeDisabled();
      await expect(endingChoices.getByRole('button').first()).toBeDisabled();
      for(let cue=0;cue<4;cue++){
        if(cue)await page.clock.fastForward(7000);
        await expect(page.locator('.cue-tape .cue-active p')).toHaveText(lines[cue]);
        await page.clock.runFor(20);
        expect(await page.evaluate(line=>storyCaptions.includes(line),lines[cue])).toBe(true);
      }
      await page.clock.fastForward(7000);
      await expect(page.locator('.performance-clock')).toContainText('Cut complete');
      await expect(branchChoices.getByRole('button').first()).toBeEnabled();
    }
  }
  expect(requests.filter(path=>path.includes('afterimage-lattice'))).toEqual([]);
  expect(requests.filter(path=>path==='/api/afterimage')).toEqual([]);
});

test('an edited semantic cut keeps its chosen ending in playback and exported story data',async({page})=>{
  await page.goto('/guest#afterimage');
  await expect(page.getByRole('button',{name:'Play this cut',exact:true})).toBeEnabled();
  const voiceOn=page.getByRole('button',{name:'Voice on',exact:true});
  if(await voiceOn.count())await voiceOn.click();
  await page.getByRole('group',{name:'Choose a branch',exact:true}).getByRole('button',{name:'Something missing',exact:true}).click();
  await page.getByRole('group',{name:'Choose an ending',exact:true}).getByRole('button',{name:'Send the second home',exact:true}).click();
  await page.getByRole('button',{name:'Edit this cut',exact:true}).click();
  await page.locator('.cut-editor textarea').first().fill('An edited second, still ours to choose.');
  await page.getByRole('button',{name:'Apply edits',exact:true}).click();
  await expect(page.locator('.cut-editor')).toBeHidden();
  await expect(page.locator('.cue-tape li p').first()).toHaveText('An edited second, still ours to choose.');
  await expect(page.locator('.cue-tape li p').last()).toHaveText('It left a note. Apparently, we are somebody else\'s extra second.');

  const downloadEvent=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export story data',exact:true}).click();
  const download=await downloadEvent;
  const exported=JSON.parse(await readFile(await download.path(),'utf8'));
  expect(exported.signalIndex).toBe(2);expect(exported.endingIndex).toBe(1);
  expect(exported.packet.signals).toHaveLength(3);
  expect(exported.packet.signals.every(signal=>signal.endings.length===2)).toBe(true);
  expect(exported.editedLines).toEqual([
    'An edited second, still ours to choose.',
    'It was the second before I met you. I think it wandered off to be interesting.',
    'There it is. Under the cursor. It brought a tiny universe home.',
    'It left a note. Apparently, we are somebody else\'s extra second.',
  ]);
  await page.getByRole('button',{name:'Play this cut',exact:true}).click();
  await expect(page.locator('.cue-tape .cue-active p')).toHaveText('An edited second, still ours to choose.');
});
