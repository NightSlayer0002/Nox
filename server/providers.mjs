import { IDENTITY, requestNox } from './ai.mjs';
import { PACKET_SCHEMA, normalizePacket, sanitizeContext } from '../shared/character.js';

const catalog = {
  groq: {name:'GroqCloud',key:'GROQ_API_KEY',env:'GROQ_MODEL',model:'openai/gpt-oss-20b',url:'https://api.groq.com/openai/v1/chat/completions'},
  gemini: {name:'Google Gemini',key:'GEMINI_API_KEY',env:'GEMINI_MODEL',model:'gemini-2.5-flash-lite'},
  nvidia: {name:'NVIDIA NIM',key:'NVIDIA_API_KEY',env:'NVIDIA_MODEL',model:'meta/llama-3.3-70b-instruct',url:'https://integrate.api.nvidia.com/v1/chat/completions'},
};
export function getProviders(env = process.env) {
  return Object.entries(catalog).filter(([,p])=>env[p.key]).map(([id,p])=>({id,name:p.name,model:env[p.env]||p.model}));
}
export function providerKey(id, env = process.env) { return env[catalog[id]?.key] || ''; }

export async function requestProvider(input, {provider, apiKey, model, fetchImpl = fetch} = {}) {
  if (provider === 'openai') return requestNox(input,{apiKey,model,fetchImpl});
  const spec=catalog[provider];
  if (!spec) throw new Error('Unknown AI provider.');
  const context=sanitizeContext(input.context);
  const instructions=`${IDENTITY}\nCurrent persona and notebook: ${JSON.stringify({mode:context.mode,name:context.name,facts:context.facts})}\nReturn JSON only, with this schema: ${JSON.stringify(PACKET_SCHEMA)}`;
  const selected=model||spec.model;
  let url=spec.url, body;
  const headers={'content-type':'application/json'};
  if(provider==='gemini') {
    url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selected)}:generateContent`;
    headers['x-goog-api-key']=apiKey;
    body={systemInstruction:{parts:[{text:instructions}]},contents:[...context.history,{role:'user',content:input.message}].map(turn=>({role:turn.role==='assistant'?'model':'user',parts:[{text:turn.content}]})),generationConfig:{maxOutputTokens:900,responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{speech:{type:'STRING'},emotion:{type:'STRING',enum:PACKET_SCHEMA.properties.emotion.enum},action:{type:'STRING',enum:PACKET_SCHEMA.properties.action.enum},memory:{type:'STRING'}},required:PACKET_SCHEMA.required}}};
  } else {
    headers.authorization=`Bearer ${apiKey}`;
    body={model:selected,messages:[{role:'system',content:instructions},...context.history,{role:'user',content:input.message}],max_tokens:900,temperature:.8};
    if(provider==='groq') {body.response_format={type:'json_object'}; if(selected.startsWith('openai/gpt-oss-')) body.reasoning_effort='low';}
  }
  const response=await fetchImpl(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(!response.ok) throw new Error(`AI provider returned HTTP ${response.status}.`);
  const data=await response.json();
  let text;
  if(provider==='gemini') {
    if(data.candidates?.[0]?.finishReason!=='STOP') throw new Error('AI provider did not finish its reply.');
    text=data.candidates[0].content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('');
  } else {
    if(data.choices?.[0]?.finish_reason && data.choices[0].finish_reason!=='stop') throw new Error('AI provider did not finish its reply.');
    text=data.choices?.[0]?.message?.content;
  }
  if(!text) throw new Error('AI provider returned no usable reply.');
  // NVIDIA models may fence JSON. Only remove a whole outer fence; never run content.
  return normalizePacket(JSON.parse(text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/,'$1')));
}
