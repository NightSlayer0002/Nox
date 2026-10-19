import {createHmac} from 'node:crypto';
import {createPublicQuota} from './public-quota.mjs';

// Redis is optional. Warm-process throttles are never presented as a durable
// daily account limit. Anonymous daily limits are shared by a public IP/network.
const SPEND=`local t=tonumber(redis.call('GET',KEYS[1]) or '0')
local s=tonumber(redis.call('GET',KEYS[2]) or '0')
local used=ARGV[1]=='text' and t or s
if used>=tonumber(ARGV[2]) then return {0,t,s} end
local key=ARGV[1]=='text' and KEYS[1] or KEYS[2]
local next=redis.call('INCR',key)
if next==1 then redis.call('EXPIRE',key,ARGV[3]) end
if ARGV[1]=='text' then t=next else s=next end
return {1,t,s}`;
const positive=(value,fallback,max)=>Number.isInteger(Number(value))&&Number(value)>0?Math.min(Number(value),max):fallback;

export function createGuestAllowance({now=Date.now,fetchImpl=fetch,
  url=process.env.UPSTASH_REDIS_REST_URL||'',token=process.env.UPSTASH_REDIS_REST_TOKEN||'',
  textLimit=process.env.NOX_FREE_TEXT_DAILY,speechLimit=process.env.NOX_FREE_SPEECH_DAILY,
  textRate=8,speechRate=4,
}={}) {
  const limits={text:positive(textLimit,20,1000),speech:positive(speechLimit,30,2000)};
  const rates={text:createPublicQuota({now,perClient:textRate,total:24}),speech:createPublicQuota({now,perClient:speechRate,total:12})};
  const configured=Boolean(url||token);
  let valid=false;
  try {const endpoint=new URL(url);valid=Boolean(token&&endpoint.protocol==='https:'&&!endpoint.username&&!endpoint.password&&!endpoint.search&&!endpoint.hash);}catch{/* Misconfiguration fails closed. */}
  const day=()=>{const time=now(),date=new Date(time).toISOString().slice(0,10),reset=Date.parse(`${date}T00:00:00.000Z`)+86400000;return {date,reset,ttl:Math.max(1,Math.ceil((reset-time)/1000))+60};};
  const keys=(client,date)=>{const identity=createHmac('sha256',token).update(client).digest('hex');return ['text','speech'].map(kind=>`nox:free:v1:${date}:${identity}:${kind}`);};
  async function command(value) {
    if(!valid)throw Error('Allowance store is not configured completely.');
    const response=await fetchImpl(url.replace(/\/$/,''),{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(value),signal:AbortSignal.timeout(2500)});
    if(!response.ok)throw Error('Allowance store unavailable.');
    const result=await response.json();
    if(result.error||!Array.isArray(result.result))throw Error('Invalid allowance store response.');
    return result.result;
  }
  const snapshot=(client,mode,counts,reset)=>({mode,scope:'shared-network',counting:'Accepted generation requests, including provider failures. Replays may use cached audio.',
    ...Object.fromEntries(['text','speech'].map((kind,i)=>[kind,{limit:mode==='preview'?null:limits[kind],used:counts?.[i]??null,remaining:counts?Math.max(0,limits[kind]-counts[i]):null,resetsAt:mode==='preview'?null:new Date(reset).toISOString()}])),
    rate:{text:rates.text.status(client),speech:rates.speech.status(client)}});
  const validCounts=counts=>counts.length===2&&counts.every(value=>value===null||/^\d+$/.test(String(value))&&Number.isSafeInteger(Number(value)))?counts.map(value=>Number(value||0)):null;
  async function status(client) {
    const {date,reset}=day();
    if(!configured)return snapshot(client,'preview',null,reset);
    try {const counts=validCounts(await command(['MGET',...keys(client,date)]));if(!counts)throw Error('Invalid counts.');return snapshot(client,'daily',counts,reset);}
    catch{return snapshot(client,'unavailable',null,reset);}
  }
  async function take(client,kind) {
    if(!Object.hasOwn(rates,kind))throw TypeError('Unknown allowance kind.');
    const wait=rates[kind].take(client);
    if(wait)return {allowed:false,code:'rate_limit',retryAfter:wait,usage:await status(client)};
    const {date,reset,ttl}=day();
    if(!configured)return {allowed:true,usage:snapshot(client,'preview',null,reset)};
    try {
      const result=await command(['EVAL',SPEND,2,...keys(client,date),kind,limits[kind],ttl]);
      const counts=validCounts(result.slice(1));
      if(![0,1].includes(result[0])||!counts)throw Error('Invalid allowance result.');
      return {allowed:result[0]===1,...(result[0]===0?{code:'daily_limit',retryAfter:Math.max(1,Math.ceil((reset-now())/1000))}:{}),usage:snapshot(client,'daily',counts,reset)};
    }catch{return {allowed:false,code:'allowance_unavailable',retryAfter:30,usage:snapshot(client,'unavailable',null,reset)};}
  }
  return {status,take};
}
