import { createBoundedDeviceStore, deviceText, isDeviceId, safeDeviceValue } from './device-store.js';

const KEY='nox.approved-preferences.v1';
const SCOPES=new Set(['general','learning','story','guessing']);
const aliases={talk:'general',conversation:'general',explore:'learning',mystery:'story',afterimage:'story',play:'story'};
const scopeOf=value=>SCOPES.has(value)?value:typeof value==='string'&&Object.hasOwn(aliases,value)?aliases[value]:null;
const bounded={
  answerLength:{values:['short','balanced','detailed'],scope:null},
  speechPace:{valid:v=>typeof v==='number'&&Number.isFinite(v)&&v>=.75&&v<=1.25,scope:null},
  learningStyle:{values:['hints','explain'],scope:'learning'},
  storyIntensity:{values:['gentle','mysterious'],scope:'story'},
  gameQuestionLimit:{valid:v=>Number.isInteger(v)&&v>=5&&v<=20,scope:'guessing'},
  gameHints:{valid:v=>typeof v==='boolean',scope:'guessing'},
};
const isValue=(key,value)=>Boolean(bounded[key]&&(bounded[key].values?bounded[key].values.includes(value):bounded[key].valid(value)));
const labels={answerLength:'Answer length',speechPace:'Speech pace',learningStyle:'Learning approach',storyIntensity:'Story intensity',gameQuestionLimit:'Guessing game questions',gameHints:'Guessing game hints'};
function validatePreference(item){
  if(!item||!safeDeviceValue(item)||!isDeviceId(item.id)||!Object.hasOwn(bounded,item.key)||!SCOPES.has(item.scope)||!isValue(item.key,item.value))return null;
  if(bounded[item.key].scope&&item.scope!==bounded[item.key].scope)return null;
  const origin=deviceText(item.origin,600);
  if(!origin||!Number.isSafeInteger(item.confirmedAt)||item.confirmedAt<0||!Number.isSafeInteger(item.updatedAt)||item.updatedAt<item.confirmedAt)return null;
  return {id:item.id,key:item.key,value:item.value,scope:item.scope,origin,confirmedAt:item.confirmedAt,updatedAt:item.updatedAt};
}
function interpret(text){
  let t=text.toLowerCase().replace(/[’]/g,"'").replace(/[.!]+$/,'').trim();
  if(/\b(?:not|never|maybe|might|could|would|if|suppose|said|says|read about)\b|n't\b|[?"“”]/.test(t)||/\b(?:and|also|or)\b/.test(t))return null;
  t=t.replace(/^(?:please )?remember (?:that )?/,'');
  const candidates=[];
  if(/^(?:please )?answer (?:briefly|concisely)$/.test(t))candidates.push(['answerLength','short']);
  if(/^(?:please )?(?:(?:keep|make|give|use|prefer|i prefer|i want|i like)\b.*\b(?:answers?|replies|responses?)\b.*\b(?:short|shorter|brief|concise)\b|(?:give|use|prefer|i prefer|i want|i like)\b.*\b(?:short|shorter|brief|concise)\b.*\b(?:answers?|replies|responses?)\b)/.test(t))candidates.push(['answerLength','short']);
  if(/^(?:please )?(?:(?:keep|make|give|use|prefer|i prefer|i want|i like)\b.*\b(?:answers?|replies|responses?)\b.*\b(?:detailed|longer|in detail)\b|(?:give|use|prefer|i prefer|i want|i like)\b.*\b(?:detailed|longer)\b.*\b(?:answers?|replies|responses?)\b)/.test(t))candidates.push(['answerLength','detailed']);
  if(/^(?:please )?(?:keep|make|give|use|prefer|i prefer|i want)\b.*\b(?:balanced|normal)\b.*\b(?:answers?|replies|responses?)\b/.test(t))candidates.push(['answerLength','balanced']);
  const numericPace=/^(?:please )?(?:speak|talk|read) at (\d+(?:\.\d+)?)\s*x$/.exec(t);
  if(numericPace)candidates.push(['speechPace',Number(numericPace[1])]);
  else if(/^(?:please )?(?:speak|talk|read|use (?:a )?(?:slower|faster|normal) (?:voice|pace))\b/.test(t)){
    if(/\b(?:slower|slowly|slow)\b/.test(t))candidates.push(['speechPace',.85]);
    if(/\b(?:faster|quickly|fast)\b/.test(t))candidates.push(['speechPace',1.15]);
    if(/\b(?:normal|regular|usual)\b/.test(t))candidates.push(['speechPace',1]);
  }
  if(/^(?:please )?(?:let me try first|one (?:clue|hint) at a time|give me (?:one |a )?(?:clue|hint)(?: at a time)?|(?:start|begin) (?:learning )?with (?:a )?(?:clue|hint)|(?:use|prefer|i prefer) hints (?:when|while|for) (?:we |i )?learn)/.test(t))candidates.push(['learningStyle','hints']);
  if(/^(?:please )?(?:explain first|(?:start|begin) (?:learning )?with (?:an )?explanation|(?:use|prefer|i prefer) explanations (?:when|while|for) (?:we |i )?learn)/.test(t))candidates.push(['learningStyle','explain']);
  if(/^(?:please )?(?:make|keep|use|prefer|i prefer|i want)\b.*\b(?:stories|story|mysteries|mystery)\b/.test(t)){
    if(/\b(?:gentle|gentler|calm|calmer|cozy)\b/.test(t))candidates.push(['storyIntensity','gentle']);
    if(/\b(?:mysterious|more mystery|spooky)\b/.test(t))candidates.push(['storyIntensity','mysterious']);
  }
  if(/\b(?:guessing|guess)\b/.test(t)){
    const number=/^(?:please )?(?:use|allow|ask|limit(?: (?:it|the game|the guessing game))? to|give me) (\d+) questions?\b/.exec(t);
    if(number)candidates.push(['gameQuestionLimit',Number(number[1])]);
    if(/^(?:please )?(?:turn|switch) hints (?:off|on)\b/.test(t))candidates.push(['gameHints',/\bon\b/.test(t)]);
    if(/^(?:please )?(?:use|give me|allow) (?:game )?hints\b/.test(t))candidates.push(['gameHints',true]);
    if(/^(?:please )?(?:no hints|play without hints)\b/.test(t))candidates.push(['gameHints',false]);
  }
  return candidates.length===1&&isValue(...candidates[0])?candidates[0]:null;
}
export function createAdaptivePreferences(storage){
  const store=createBoundedDeviceStore(storage,{key:KEY,field:'preferences',validate:validatePreference,limit:24,maxBytes:60000,identity:item=>`${item.scope}:${item.key}`}),pending=new Map();
  return {
    get persistent(){return store.persistent;},get crossTabSafe(){return store.crossTabSafe;},get status(){return store.status;},
    list:()=>store.read(),
    propose(text,scope='general'){
      const origin=deviceText(text,600),requested=scopeOf(scope);if(!origin||!requested)return null;
      const interpretation=interpret(origin);if(!interpretation)return null;
      const [key,value]=interpretation,proposal={id:globalThis.crypto.randomUUID(),key,value,scope:bounded[key].scope??requested,origin,label:labels[key]};
      if(pending.size>=20)pending.delete(pending.keys().next().value);
      pending.set(proposal.id,proposal);return structuredClone(proposal);
    },
    approve(proposal){
      let snapshot;try{snapshot=structuredClone(proposal);}catch{return Promise.resolve(null);}
      return store.mutate(items=>{
        const offered=snapshot&&pending.get(snapshot.id);
        if(!offered||['key','value','scope','origin'].some(key=>snapshot[key]!==offered[key]))return null;
        const existing=items.find(item=>item.key===offered.key&&item.scope===offered.scope),now=Date.now();
        const item=validatePreference({...offered,id:existing?.id??offered.id,confirmedAt:now,updatedAt:now});
        return item?{candidate:[...items.filter(v=>v.id!==item.id),item],result:item,afterCommit:()=>pending.delete(snapshot.id)}:null;
      });
    },
    update(id,value){
      return store.mutate(items=>{
        const item=items.find(v=>v.id===id);if(!item||!isValue(item.key,value))return null;
        const updated={...item,value,updatedAt:Math.max(Date.now(),item.updatedAt)};
        return {candidate:items.map(v=>v.id===id?updated:v),result:updated};
      });
    },
    remove(id){return store.mutate(items=>items.some(v=>v.id===id)?{candidate:items.filter(v=>v.id!==id),result:true}:{result:false},false);},
    clear(){return store.mutate(()=>({candidate:[],result:true,afterCommit:()=>pending.clear()}),false);},
    context(scope='general'){
      const requested=scopeOf(scope);if(!requested)return {};
      const items=store.read(),result={};
      for(const item of items.filter(v=>v.scope==='general'))result[item.key]=item.value;
      if(requested!=='general')for(const item of items.filter(v=>v.scope===requested))result[item.key]=item.value;
      return result;
    },
    export:()=>store.export(),
    import:serialized=>store.import(serialized,{equivalent:(a,b)=>a.id===b.id||(a.key===b.key&&a.scope===b.scope)}),
  };
}
