import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import * as activities from '../shared/everyday-activities.js';

const {GUESS_OBJECTS,GUESS_QUESTIONS,createGuessingState,restoreGuessingState,updateGuessingState}=activities;
const offeredIds=['food','plant','made','hand','round','metal','wood','paper','wear','transport','wheels','music','strings','battery','light','clean','furniture','write','read','drink','eat','door','rain','time','sport'];
const historicalIds=['kitchen','indoor','outdoor','bathroom'];

// Manually reviewed expectations for the named versions, NOT read from production tags.
// Every omitted offered question is No. Whole-object shape/material/function count;
// a plant-derived material does not mean the manufactured object grows on a plant.
// Hand-sized means an ordinary adult's comfortable grasp; large clock/full-size
// instrument and chair are not hand-sized. These assumptions are not universal
// facts about every variant, culture, person's grip, or use of these object names.
const reviewed=[
  {id:'apple',label:'an apple',yes:['food','plant','hand','round']},
  {id:'banana',label:'a banana',yes:['food','plant','hand']},
  {id:'pencil',label:'a wooden graphite pencil',yes:['made','hand','wood','write']},
  {id:'book',label:'a paper book',yes:['made','hand','paper','read']},
  {id:'key',label:'a metal door key',yes:['made','hand','metal','door']},
  {id:'spoon',label:'a metal spoon',yes:['made','hand','metal','eat']},
  {id:'mug',label:'a ceramic mug',yes:['made','hand','drink']},
  {id:'shoe',label:'a slip-on shoe without laces',yes:['made','hand','wear']},
  {id:'ball',label:'a small soccer ball',yes:['made','hand','round','sport']},
  {id:'bicycle',label:'a non-electric metal commuter bicycle',yes:['made','metal','transport','wheels']},
  {id:'umbrella',label:'an umbrella',yes:['made','hand','rain']},
  {id:'candle',label:'a wax candle',yes:['made','hand','light']},
  {id:'toothbrush',label:'a manual toothbrush',yes:['made','hand','clean']},
  {id:'guitar',label:'a full-size wooden acoustic guitar',yes:['made','wood','music','strings']},
  {id:'chair',label:'a wooden chair',yes:['made','wood','furniture']},
  {id:'clock',label:'a large round battery wall clock',yes:['made','round','battery','time']},
];

for(const row of reviewed)test(`represented ${row.id} answers match the reviewed non-location matrix`,()=>{
  // Question: Do actual answers match the manually declared facts of this represented object?
  // Limit: Authored semantic review under the assumptions above, not independent human validation of all real-world variants.
  const index=GUESS_OBJECTS.findIndex(object=>object.id===row.id);assert.notEqual(index,-1);
  for(const id of offeredIds){
    const state=updateGuessingState(createGuessingState({seed:index}),{type:'question',id});
    assert.equal(state.events[0]?.answer,row.yes.includes(id),`${row.id}: ${id}`);
  }
  const object=GUESS_OBJECTS[index];assert.equal(object.displayName||object.name,row.label);
});

test('newly offered questions omit location assumptions while historical question IDs remain supported',()=>{
  // Question: Are new choices separated from the catalogue used to replay old rounds?
  // Limit: Exported-list/engine contract; the component's actual choices are tested separately below.
  assert.deepEqual(activities.GUESS_OFFERED_QUESTIONS?.map(question=>question.id),offeredIds);
  for(const id of historicalIds)assert.ok(GUESS_QUESTIONS.some(question=>question.id===id));
});

test('the reviewed remaining questions distinguish all sixteen represented objects',()=>{
  // Question: Does each pair of represented objects have at least one different answer in the independent matrix?
  // Limit: Pairwise distinguishability, not an optimal decision tree or a guarantee of winning within every turn limit.
  assert.deepEqual(GUESS_OBJECTS.map(object=>object.id).sort(),reviewed.map(row=>row.id).sort());
  for(let first=0;first<reviewed.length;first++)for(let second=first+1;second<reviewed.length;second++){
    assert.ok(offeredIds.some(id=>reviewed[first].yes.includes(id)!==reviewed[second].yes.includes(id)),`${reviewed[first].id} and ${reviewed[second].id} need a distinguishing question`);
  }
});

const legacyEvents=[
  {type:'question',id:'kitchen',text:'Would you commonly find it in a kitchen?',answer:false},
  {type:'question',id:'indoor',text:'Is it mainly used indoors?',answer:true},
  {type:'question',id:'outdoor',text:'Is it commonly used outdoors?',answer:false},
  {type:'question',id:'bathroom',text:'Would you commonly find it in a bathroom?',answer:true},
];
const legacyRound={version:1,kind:'guessing',targetId:'toothbrush',rules:{questionLimit:10,hints:true},events:legacyEvents};

test('historical location questions replay their original text and answers and the round can continue',()=>{
  // Question: Does removing choices leave a saved round's existing answers, text and progress intact?
  // Limit: One literal four-question history and continued guess; not every archived browser record or future migration.
  const original=structuredClone(legacyRound),restored=restoreGuessingState(legacyRound);
  assert.deepEqual(restored.events,legacyEvents);assert.equal(restored.turns,4);assert.equal(restored.status,'playing');
  const next=updateGuessingState(restored,{type:'guess',value:'toothbrush'});assert.equal(next.status,'won');assert.equal(next.turns,5);assert.equal(next.events.at(-1).text,'a toothbrush');
  assert.deepEqual(legacyRound,original);
});

test('presentation qualifications do not relabel historical guesses',()=>{
  // Question: Do the qualified collection labels preserve the old engine names in restored events?
  // Limit: Known literal legacy names and valid guess events; does not establish arbitrary import fidelity.
  for(const [id,name] of [['pencil','a pencil'],['shoe','a shoe'],['ball','a football'],['bicycle','a bicycle'],['toothbrush','a toothbrush'],['guitar','an acoustic guitar'],['clock','a battery wall clock']]){
    const event={type:'guess',id,text:name,answer:true};
    const restored=restoreGuessingState({version:1,kind:'guessing',targetId:id,rules:{questionLimit:10,hints:true},events:[event]});
    assert.deepEqual(restored.events,[event]);assert.equal(restored.status,'won');
  }
});

test('qualified visible object names remain accepted guesses alongside legacy aliases',()=>{
  // Question: Can the player type the actual displayed version name without losing support for old names?
  // Limit: These exact labels and literal legacy aliases for the seven qualified objects, not open-ended natural-language recognition.
  const legacyAliases={pencil:['pencil','a pencil'],shoe:['shoe','a shoe'],ball:['ball','a ball','football','a football','soccer ball','a soccer ball'],bicycle:['bicycle','a bicycle','bike','a bike'],toothbrush:['toothbrush','a toothbrush','tooth brush','a tooth brush'],guitar:['guitar','a guitar','an acoustic guitar','acoustic guitar'],clock:['clock','a clock','wall clock','a wall clock','battery wall clock','a battery wall clock']};
  for(const row of reviewed){
    const index=GUESS_OBJECTS.findIndex(object=>object.id===row.id);
    for(const value of [row.label,...legacyAliases[row.id]||[]])assert.equal(updateGuessingState(createGuessingState({seed:index}),{type:'guess',value}).status,'won',`${row.id}: ${value}`);
  }
});

const nativeRequire=createRequire(import.meta.url);
const bundle=await build({entryPoints:[path.resolve(import.meta.dirname,'../client/everyday-activities.jsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'transform',external:['react','/js/everyday-bridge.js']});
const componentModule={exports:{}};
vm.runInNewContext(bundle.outputFiles[0].text,{module:componentModule,exports:componentModule.exports,require:id=>id==='/js/everyday-bridge.js'?{everydayBridge:{stop(){}}}:nativeRequire(id),crypto:globalThis.crypto,structuredClone,Date,Math,console});

for(const [name,state] of [['fresh',createGuessingState({seed:0})],['restored',legacyRound]])test(`the actual ${name} game component offers only reviewed questions and shows the qualified collection`,()=>{
  // Question: Does the component use the offered subset rather than the full replay catalogue?
  // Limit: Real React server rendering, not native select interaction, CSS layout, accessibility-tree or browser persistence.
  const markup=renderToStaticMarkup(React.createElement(componentModule.exports.default,{kind:'guessing',initialState:state}));
  const choices=markup.match(/<select\b[^>]*>([\s\S]*?)<\/select>/)?.[1];assert.ok(choices);
  const ids=[...choices.matchAll(/<option\b[^>]*value="([^"]*)"/g)].map(([,value])=>value).filter(Boolean);
  assert.deepEqual(ids,offeredIds);
  for(const row of reviewed)assert.ok(markup.includes(row.label),`${row.label} must be visible`);
  if(name==='restored')for(const event of legacyEvents)assert.ok(markup.includes(event.text),'old question text remains in the displayed round');
});
