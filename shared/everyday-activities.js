import {cleanText} from './character.js';
// Bounded, authored experiences. This module never calls or imitates an AI model.
export const ACTIVITY_VERSION=1;
export const EXPLORE_MAX_TEXT=5000;
const text=(value,max=6000)=>typeof value==='string'?value.trim().slice(0,max):'';
const clamp=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Math.round(Number(value)))):fallback;
const own=(value)=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
export const MOON_SOURCE='https://science.nasa.gov/moon/moon-phases/';
export const MOON_CLUES=Object.freeze([
  'The Moon reflects sunlight. Look at which half faces the Sun.',
  'Our view changes as the Moon travels around Earth. Compare the two views.',
  'Put Earth between the Sun and Moon. We can then see the Moon’s sunlit face: a full Moon.',
]);
export const MOON_EXPLANATION='The Moon reflects sunlight. Apart from eclipses, one half is sunlit. As it orbits Earth, we see different amounts of that lit half. That changing view makes the phases; ordinary phases are not Earth’s shadow.';
export function moonPhase(angle){
  const degrees=((Number(angle)||0)%360+360)%360,fraction=(1-Math.cos(degrees*Math.PI/180))/2;
  // Reserve exact positions for their model geometry; intermediate angles are
  // crescent/gibbous, rather than a rounded quarter or full Moon.
  const exact={0:'New Moon',90:'First quarter',180:'Full Moon',270:'Third quarter'};
  const name=exact[degrees]??(degrees<90?'Waxing crescent':degrees<180?'Waxing gibbous':degrees<270?'Waning gibbous':'Waning crescent');
  return {degrees,fraction,name,waxing:degrees<=180};
}
export function createExploreState(preferences={}){
  return {version:ACTIVITY_VERSION,kind:'explore',topic:'',example:'moon',angle:45,approach:preferences.learningStyle==='hints'?'hints':'explain',clues:preferences.learningStyle==='hints'?1:0,prediction:'',teachBack:'',selfCheck:[],recap:false};
}
export function restoreExploreState(value,preferences={}){
  const raw=own(value),base=createExploreState(preferences);
  if(raw.version!==ACTIVITY_VERSION||raw.kind!=='explore')return base;
  return {...base,topic:text(raw.topic,EXPLORE_MAX_TEXT),angle:clamp(raw.angle,0,360,45),approach:['hints','explain'].includes(raw.approach)?raw.approach:base.approach,clues:clamp(raw.clues,0,3,0),prediction:['between','opposite','quarter'].includes(raw.prediction)?raw.prediction:'',teachBack:text(raw.teachBack,1600),selfCheck:Array.isArray(raw.selfCheck)?[...new Set(raw.selfCheck.filter(x=>['light','view','question'].includes(x)))]:[],recap:raw.recap===true};
}
export function exploreRecap(value){
  const state=restoreExploreState(value),checked=state.selfCheck;
  return {title:'Why the Moon changes shape',summary:'Sunlight lights half the Moon. Its orbit changes our view of the lit half.',understood:checked.includes('light')&&checked.includes('view')?'You marked reflected sunlight and our changing view as clear.':'Your self-check is still open; try explaining the two views.',open:checked.includes('question')?'You marked a question to return to. Bring it to NOX in chat.':state.prediction==='opposite'?'You found the full-Moon position.':'Try placing the Moon opposite the Sun, with Earth between them.',teachBack:state.teachBack};
}
// The answers describe these particular everyday objects, rather than every possible
// kind of apple, clock, etc. The candidate list and supported questions are visible.
// Presentation labels clarify the represented version without renaming old events.
export const GUESS_OBJECTS=Object.freeze([
  {id:'apple',name:'an apple',aliases:['apple','an apple','a apple'],tags:['food','plant','hand','round'],hints:['It comes from a tree.','It can be red or green.','It has a core and seeds.']},
  {id:'banana',name:'a banana',aliases:['banana','a banana'],tags:['food','plant','hand'],hints:['It is a fruit.','You peel it before eating.','It is long, curved and usually yellow when ripe.']},
  {id:'pencil',name:'a pencil',displayName:'a wooden graphite pencil',aliases:['pencil','a pencil','wooden graphite pencil','a wooden graphite pencil'],tags:['made','hand','wood','write'],hints:['It belongs on a desk.','It leaves a mark you can erase.','Its writing core is graphite.']},
  {id:'book',name:'a paper book',aliases:['book','a book','paper book','a paper book'],tags:['made','hand','paper','read','indoor'],hints:['It has a spine.','Its pages hold words.','You read it without a screen.']},
  {id:'key',name:'a metal door key',aliases:['key','a key','door key','a door key','metal key','a metal door key'],tags:['made','hand','metal','door'],hints:['It fits in a pocket.','It has teeth but cannot bite.','It turns inside a door lock.']},
  {id:'spoon',name:'a metal spoon',aliases:['spoon','a spoon','metal spoon','a metal spoon'],tags:['made','hand','metal','kitchen','eat'],hints:['It is cutlery.','It has a shallow bowl.','It helps you eat soup.']},
  {id:'mug',name:'a ceramic mug',aliases:['mug','a mug','cup','a cup','ceramic mug','a ceramic mug'],tags:['made','hand','kitchen','drink','indoor'],hints:['It has a handle.','It holds a drink.','You might fill it with tea.']},
  {id:'shoe',name:'a shoe',displayName:'a slip-on shoe without laces',aliases:['shoe','a shoe','slip-on shoe without laces','a slip-on shoe without laces'],tags:['made','hand','wear','outdoor'],hints:['You usually use two.','It protects part of your body.','You wear it on a foot.']},
  {id:'ball',name:'a football',displayName:'a small soccer ball',aliases:['ball','a ball','football','a football','soccer ball','a soccer ball','small soccer ball','a small soccer ball'],tags:['made','hand','round','sport','outdoor'],hints:['You can play a team sport with it.','It rolls and bounces.','Players kick it toward a goal.']},
  {id:'bicycle',name:'a bicycle',displayName:'a non-electric metal commuter bicycle',aliases:['bicycle','a bicycle','bike','a bike','non-electric metal commuter bicycle','a non-electric metal commuter bicycle'],tags:['made','metal','transport','outdoor','wheels'],hints:['It takes you places.','You power it with pedals.','It has two wheels.']},
  {id:'umbrella',name:'an umbrella',aliases:['umbrella','an umbrella','a umbrella'],tags:['made','hand','outdoor','rain'],hints:['It folds away.','You carry it above your head.','It keeps rain off you.']},
  {id:'candle',name:'a wax candle',aliases:['candle','a candle','wax candle','a wax candle'],tags:['made','hand','light','indoor'],hints:['It gets smaller as you use it.','It has a wick.','Its flame gives light.']},
  {id:'toothbrush',name:'a toothbrush',displayName:'a manual toothbrush',aliases:['toothbrush','a toothbrush','tooth brush','a tooth brush','manual toothbrush','a manual toothbrush'],tags:['made','hand','bathroom','clean','indoor'],hints:['You use it in the bathroom.','It has bristles.','You put toothpaste on it.']},
  {id:'guitar',name:'an acoustic guitar',displayName:'a full-size wooden acoustic guitar',aliases:['guitar','a guitar','an acoustic guitar','acoustic guitar','full-size wooden acoustic guitar','a full-size wooden acoustic guitar'],tags:['made','wood','music','strings'],hints:['It is a musical instrument.','You can strum it.','A standard one has six strings.']},
  {id:'chair',name:'a wooden chair',aliases:['chair','a chair','wooden chair','a wooden chair'],tags:['made','wood','furniture','indoor'],hints:['It is furniture.','It has a back and legs.','You sit on it.']},
  {id:'clock',name:'a battery wall clock',displayName:'a large round battery wall clock',aliases:['clock','a clock','wall clock','a wall clock','battery wall clock','a battery wall clock','large round battery wall clock','a large round battery wall clock'],tags:['made','round','battery','time','indoor'],hints:['It hangs on a wall.','Its hands move throughout the day.','It tells the time.']},
].map(item=>Object.freeze({...item,aliases:Object.freeze(item.aliases),tags:Object.freeze(item.tags),hints:Object.freeze(item.hints)})));
export const GUESS_QUESTIONS=Object.freeze([
  ['food','Can you eat it?'],['plant','Does it grow on a plant?'],['made','Is it made by people?'],['hand','Can you comfortably hold it in one hand?'],['round','Is it roughly ball-shaped or circular?'],['metal','Is its main material metal?'],['wood','Is its main material wood?'],['paper','Is it made mainly of paper?'],['kitchen','Would you commonly find it in a kitchen?'],['indoor','Is it mainly used indoors?'],['outdoor','Is it commonly used outdoors?'],['wear','Do you wear it?'],['transport','Is it a form of transport?'],['wheels','Does it have wheels?'],['music','Does it make music?'],['strings','Does it have strings?'],['battery','Does it use a battery?'],['light','Does it give light?'],['clean','Is it used for cleaning?'],['furniture','Is it furniture?'],['write','Do you write with it?'],['read','Do you read it?'],['drink','Do you drink from it?'],['eat','Do you eat with it?'],['door','Is it used with a door?'],['rain','Does it keep rain off you?'],['time','Does it tell the time?'],['sport','Is it used for sport?'],['bathroom','Would you commonly find it in a bathroom?'],
].map(([id,label])=>Object.freeze({id,label})));
// Keep the full catalogue for saved-round replay; these context-dependent
// questions are no longer offered for a player's next question.
const historicalContextQuestions=new Set(['kitchen','indoor','outdoor','bathroom']);
export const GUESS_OFFERED_QUESTIONS=Object.freeze(GUESS_QUESTIONS.filter(question=>!historicalContextQuestions.has(question.id)));
export const DEFAULT_GAME_RULES=Object.freeze({questionLimit:10,hints:true});
export function normalizeGameRules(value={}){return {questionLimit:clamp(value.questionLimit??value.gameQuestionLimit,5,20,10),hints:(value.hints??value.gameHints)!==false};}
const objectFor=id=>GUESS_OBJECTS.find(item=>item.id===id);
const questionFor=id=>GUESS_QUESTIONS.find(item=>item.id===id);
export function normalizeGuess(value){return text(value,100).toLowerCase().replace(/[?.!]+$/g,'').replace(/^(?:is it|could it be|i guess|my guess is)\s+/,'').replace(/\s+/g,' ').trim();}
export function createGuessingState({seed=0,rules={}}={}){
  const numeric=Number(seed),index=Number.isFinite(numeric)?Math.abs(Math.trunc(numeric))%GUESS_OBJECTS.length:0;
  return {version:ACTIVITY_VERSION,kind:'guessing',targetId:GUESS_OBJECTS[index].id,rules:normalizeGameRules(rules),events:[],turns:0,hintsUsed:0,status:'playing'};
}
function transitionGuessing(state,action){
  if(state.status!=='playing')return state;
  const target=objectFor(state.targetId),events=state.events;
  if(action.type==='hint'){
    if(!state.rules.hints||state.hintsUsed>=3)return state;
    return {...state,hintsUsed:state.hintsUsed+1,events:[...events,{type:'hint',number:state.hintsUsed+1,text:target.hints[state.hintsUsed]}]};
  }
  let event;
  if(action.type==='question'){
    const question=questionFor(action.id);
    if(!question||events.some(item=>item.type==='question'&&item.id===question.id))return state;
    event={type:'question',id:question.id,text:question.label,answer:target.tags.includes(question.id)};
  }else if(action.type==='guess'){
    const guess=normalizeGuess(action.value),candidate=GUESS_OBJECTS.find(item=>item.aliases.includes(guess));
    if(!candidate||events.some(item=>item.type==='guess'&&item.id===candidate.id))return state;
    event={type:'guess',id:candidate.id,text:candidate.name,answer:candidate.id===target.id};
  }else return state;
  const turns=state.turns+1,status=event.type==='guess'&&event.answer?'won':turns>=state.rules.questionLimit?'lost':'playing';
  return {...state,events:[...events,event],turns,status};
}
export function restoreGuessingState(value){
  const raw=own(value),target=objectFor(raw.targetId);
  if(raw.version!==ACTIVITY_VERSION||raw.kind!=='guessing'||!target)return createGuessingState();
  let state=createGuessingState({seed:GUESS_OBJECTS.indexOf(target),rules:own(raw.rules)});
  // Recompute all answers and counters; imports cannot supply their own outcomes.
  for(const event of (Array.isArray(raw.events)?raw.events:[]).slice(0,23)){
    if(!event||typeof event!=='object')continue;
    const action=event.type==='guess'?{type:'guess',value:objectFor(event.id)?.name}:event.type==='question'?{type:'question',id:event.id}:{type:event.type==='hint'?'hint':'invalid'};
    state=transitionGuessing(state,action);
  }
  return state;
}
export function updateGuessingState(value,action){return transitionGuessing(restoreGuessingState(value),own(action));}
export function guessingResult(value){
  const state=restoreGuessingState(value),target=objectFor(state.targetId);
  if(state.status==='won')return `You found ${target.name} in ${state.turns} ${state.turns===1?'turn':'turns'}.`;
  if(state.status==='lost')return `The object was ${target.name}. You used all ${state.rules.questionLimit} turns.`;
  return `${state.rules.questionLimit-state.turns} turns left. Questions and guesses each use one turn.`;
}
