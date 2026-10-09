import { ACTIONS, EMOTIONS, cleanText } from './character.js';

const string = limit => ({type:'string',minLength:1,maxLength:limit});
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const cues = {speech:string(90),emotion:{type:'string',enum:EMOTIONS},action:{type:'string',enum:ACTIONS}};
const array = (items,count) => ({type:'array',items,minItems:count,maxItems:count});

export const AFTERIMAGE_SCHEMA = object({
  title:string(80),anchor:string(160),
  signals:array(object({label:string(48),premise:string(180),beats:array(object(cues),3),endings:array(object({label:string(48),...cues}),2)}),3),
  caption:string(280),
});

function exactObject(value,required,optional=[]){
  if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>![...required,...optional].includes(key)))
    throw new TypeError('AFTERIMAGE contains an incomplete or unexpected structure.');
}
function text(value,limit){
  const result=cleanText(value,limit);
  if(!result)throw new TypeError('AFTERIMAGE text must be a non-empty string.');
  return result;
}
function fixedArray(value,count){
  if(!Array.isArray(value)||value.length!==count)throw new TypeError('AFTERIMAGE contains an incorrect number of signals or cues.');
  return value;
}
function normalizeCue(value,ending=false){
  exactObject(value,ending?['label','speech','emotion','action']:['speech','emotion','action']);
  if(typeof value.emotion!=='string'||typeof value.action!=='string')throw new TypeError('AFTERIMAGE cue mood and action must be strings.');
  return {...(ending?{label:text(value.label,48)}:{}),speech:text(value.speech,90),emotion:EMOTIONS.includes(value.emotion)?value.emotion:'neutral',action:ACTIONS.includes(value.action)?value.action:'none'};
}

// No generated commands, URLs or new scene powers exist in this contract.
export function normalizeAfterimage(value){
  exactObject(value,['title','anchor','signals','caption']);
  return {
    title:text(value.title,80),anchor:text(value.anchor,160),
    signals:fixedArray(value.signals,3).map(signal=>{
      exactObject(signal,['label','premise','beats','endings']);
      return {label:text(signal.label,48),premise:text(signal.premise,180),beats:fixedArray(signal.beats,3).map(cue=>normalizeCue(cue)),endings:fixedArray(signal.endings,2).map(cue=>normalizeCue(cue,true))};
    }),caption:text(value.caption,280),
  };
}

export function sanitizeAfterimageInput(value){
  exactObject(value,['seed','tone'],['variation','provider']);
  if(typeof value.seed!=='string'||value.seed.length>600)throw new TypeError('Give AFTERIMAGE a seed of 1–600 characters.');
  const seed=cleanText(value.seed,600);
  if(!seed)throw new TypeError('Give AFTERIMAGE a seed of 1–600 characters.');
  if(!['wonder','uncanny','bold'].includes(value.tone))throw new TypeError('Choose wonder, uncanny or bold.');
  const variation=value.variation===undefined?0:value.variation;
  if(!Number.isInteger(variation)||variation<0||variation>1024)throw new TypeError('Variation must be an integer from 0 to 1024.');
  if(value.provider!==undefined&&!['groq','gemini','nvidia'].includes(value.provider))throw new TypeError('Choose a configured Groq, Gemini or NVIDIA provider.');
  return {seed,tone:value.tone,variation,...(value.provider!==undefined?{provider:value.provider}:{})};
}
