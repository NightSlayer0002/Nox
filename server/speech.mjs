import { splitSpeech, startupSpeechChunks, joinWav, validateWav } from './wav.mjs';
import {createHash} from 'node:crypto';
import {EMOTIONS} from '../shared/character.js';

const directions = {
  companion: 'Speak as a thoughtful young companion. Warm, conversational, understated, with relaxed pauses and dry humor. Avoid an announcer or assistant cadence.',
  director: 'Speak with casual confidence and a wry smile. Conversational timing, lightly sarcastic, never a formal announcer.',
  uncanny: 'Speak quietly with subtle suspense and unhurried pauses. An intimate fictional performance, no shouting and no exaggerated villain voice.',
};
const MAX_AUDIO = 2*1024*1024;
const WAV_TYPES=['audio/wav','audio/wave','audio/x-wav','audio/vnd.wave'];
const MPEG_TYPES=['audio/mpeg','audio/mp3','audio/x-mp3','audio/mpeg3','audio/x-mpeg3'];
function validateMpeg(audio){
  let offset=0;
  if(audio.toString('ascii',0,3)==='ID3'){
    if(audio.length<10||![2,3,4].includes(audio[3])||audio[4]===0xff||audio.subarray(6,10).some(value=>value&0x80))throw new Error('Invalid ID3 header.');
    const size=audio.subarray(6,10).reduce((value,byte)=>value*128+byte,0),footer=audio[3]===4&&(audio[5]&0x10)?10:0;
    offset=10+size+footer;
    if(footer&&audio.toString('ascii',offset-10,offset-7)!=='3DI')throw new Error('Invalid ID3 footer.');
  }
  // A recognizable Layer III header after the bounded ID3 tag is a format
  // guard, not a decoder or proof that every MPEG frame is complete/playable.
  if(audio.length<offset+5||audio[offset]!==0xff||(audio[offset+1]&0xe0)!==0xe0||((audio[offset+1]>>3)&3)===1||((audio[offset+1]>>1)&3)!==1||(audio[offset+2]>>4)===15||((audio[offset+2]>>2)&3)===3||(audio[offset+3]&3)===2)throw new Error('Invalid MPEG header.');
  return audio;
}
function awaitSpeech(promise,signal){
  if(signal.aborted)return Promise.reject(signal.reason);
  return new Promise((resolve,reject)=>{
    const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason);};
    signal.addEventListener('abort',abort,{once:true});
    promise.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
const actingDirection=(emotion,mode)=>({happy:'[cheerful] [excited] ',skeptical:'[deadpan] [skeptical] ',sleepy:'[sleepy] [breathy] ',uncanny:'[gravelly whisper] [dramatic] ',curious:'[curious] [warm] ',annoyed:'[sarcastic] [exasperated] ',surprised:'[surprised] [excited] ',shy:'[shy] [breathy] ',neutral:mode==='uncanny'?'[whisper] ':mode==='director'?'[confidently] [deadpan] ':''}[emotion]||'');
export function normalizeSpeechCues(text,value){
  if(value===undefined)return undefined;
  if(!Array.isArray(value)||value.length!==4)throw new TypeError('Speech cues need four lines.');
  const lines=value.map(cue=>{if(!cue||Object.keys(cue).some(k=>!['speech','emotion'].includes(k))||typeof cue.speech!=='string'||!cue.speech.trim()||cue.speech.length>90||!EMOTIONS.includes(cue.emotion))throw new TypeError('Speech cue text and emotion are invalid.');return {speech:cue.speech.trim(),emotion:cue.emotion};});
  if(lines.map(cue=>cue.speech).join('\n')!==text.trim())throw new TypeError('Speech cues must match the spoken script.');
  return lines;
}

export async function requestSpeech(input,options={}) {
  const clips=[];
  for await(const clip of requestSpeechClips(input,options))clips.push(clip);
  return options.provider==='groq'&&clips.length>1?joinWav(clips,MAX_AUDIO):clips[0];
}

// Same bounded synthesis plan as requestSpeech; expose each clip without waiting
// for a slower later clip. Consumers must preserve this iteration order.
export async function* requestSpeechClips({text,mode='companion',emotion,speechCues}, {apiKey,voice='cedar',provider='openai',fetchImpl=fetch,clipCache,cacheScope='private',signal:callerSignal}={}) {
  if (typeof text !== 'string' || !text.trim() || text.length > 420) throw new Error('Speech needs 1–420 characters.');
  if(!['openai','groq'].includes(provider)) throw new Error('Unknown speech provider.');
  const groq = provider === 'groq';
  const deadline=AbortSignal.timeout(20000),controller=new AbortController(),signal=AbortSignal.any([controller.signal,deadline,...(callerSignal?[callerSignal]:[])]);
  if(signal.aborted)throw signal.reason;
  const cues=normalizeSpeechCues(text,speechCues);
  const getClip=async input=>{
    // Cached synthesis owns its deadline; callers hold independent subscriptions.
    const create=sharedSignal=>requestClip(input,mode,{apiKey,voice,groq,fetchImpl,signal:sharedSignal?AbortSignal.any([sharedSignal,AbortSignal.timeout(20000)]):signal});
    if(!clipCache)return create();
    const key=createHash('sha256').update(JSON.stringify([cacheScope,apiKey,voice,provider,mode,input])).digest('hex');
    return (await clipCache.getOrCreate(key,create,{signal})).value;
  };
  const segments=groq?(cues||[{speech:text.trim(),emotion}]).flatMap(cue=>{const direction=actingDirection(cue.emotion,mode);return (cues?splitSpeech:startupSpeechChunks)(cue.speech,200-direction.length).map(chunk=>direction+chunk);}):[text];
  let size=0;
  // Handle every promise immediately, including a later segment that rejects
  // while an earlier one is still pending.
  const pending=segments.map(input=>getClip(input).then(audio=>{
    size+=audio.byteLength;if(size>MAX_AUDIO)throw new Error('Combined speech audio is too large.');
    return {audio};
  }).catch(error=>({error})));
  let complete=false;
  try{
    for(const next of pending){
      const result=await awaitSpeech(next,signal);
      if(signal.aborted)throw signal.reason;
      if(result.error)throw result.error;
      yield result.audio;
    }
    complete=true;
  }finally{if(!complete)controller.abort();}
}

async function requestClip(text,mode,{apiKey,voice,groq,fetchImpl,signal}) {
  const response = await fetchImpl(groq?'https://api.groq.com/openai/v1/audio/speech':'https://api.openai.com/v1/audio/speech', {
    method:'POST', headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},
    signal,
    body:JSON.stringify(groq ? {model:'canopylabs/orpheus-v1-english',voice:['troy','austin','daniel','hannah'].includes(voice)?voice:'troy',input:text.trim(),response_format:'wav'} : {model:'gpt-4o-mini-tts',voice:['cedar','marin'].includes(voice)?voice:'cedar',input:text.trim(),instructions:directions[mode]||directions.companion,response_format:'mp3'}),
  });
  signal.throwIfAborted();
  if (!response.ok) {
    let code = response.status === 429 ? 'quota' : response.status === 401 ? 'credentials' : 'provider_http';
    try {
      const data = await response.json();
      const message = typeof data.error?.message === 'string' ? data.error.message : '';
      if (/terms/i.test(message) && /accept|require/i.test(message)) code = 'terms_required';
      else if (/200/.test(message) && /character|length/i.test(message)) code = 'input_limit';
      else if (/permission|enable.*model/i.test(message)) code = 'model_permission';
    } catch { /* Keep only the HTTP status when the error body is not JSON. */ }
    // Only constant categories and numeric status survive; never retain upstream messages.
    throw Object.assign(new Error(`Speech provider returned HTTP ${response.status}.`),{providerStatus:response.status,code});
  }
  const contentType=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!(groq?WAV_TYPES:MPEG_TYPES).includes(contentType)) throw Object.assign(new Error('Speech provider did not return the requested audio format.'),{code:'invalid_audio_type',audioType:['application/octet-stream','application/json','text/html'].includes(contentType)?contentType:'other'});
  if (Number(response.headers.get('content-length')) > MAX_AUDIO) throw new Error('Speech audio is too large.');
  const reader=response.body?.getReader(); if(!reader) throw new Error('Speech provider returned no audio.');
  const chunks=[]; let size=0;
  try {
    while(true) {
      const {done,value}=await reader.read(); if(done) break;
      signal.throwIfAborted();
      size+=value.length; if(size>MAX_AUDIO) throw new Error('Speech audio is too large.');
      chunks.push(Buffer.from(value));
    }
  } catch(error) { await reader.cancel().catch(()=>{}); throw error; }
  signal.throwIfAborted();
  if(!size) throw new Error('Speech provider returned empty audio.');
  const audio=Buffer.concat(chunks);
  try{return groq?validateWav(audio):validateMpeg(audio);}
  catch{throw Object.assign(new Error(`Speech provider returned invalid ${groq?'WAV':'MPEG'} audio.`),{code:'invalid_audio_data'});}
}
