import http from 'node:http';
import { isIP } from 'node:net';
import {once} from 'node:events';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizePacket, sanitizeContext, answerDepth, EMOTIONS, CHAT_INPUT_CHARACTERS, CHAT_REQUEST_BYTES, MAX_PACKET_CHARACTERS } from './shared/character.js';
import {capabilitiesForModel} from './shared/product-capabilities.js';
import { requestNox, explicitMemoryRequest } from './server/ai.mjs';
import { getProviders, providerKey, requestProvider, requestSummary, modelForDepth } from './server/providers.mjs';
import {FREE_CHAT_MODEL,requestFreeChat} from './server/free-model-policy.mjs';
import {createChatBudget,CHAT_BUDGET_MS} from './server/chat-budget.mjs';
import { createCache } from './server/cache.mjs';
import { requestSpeech,requestSpeechClips,normalizeSpeechCues } from './server/speech.mjs';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { mintSession, validSession, sessionFromCookie, sessionCookie, createUnlockThrottle } from './server/session.mjs';
import { sanitizeAfterimageInput } from './shared/afterimage.js';
import { createAfterimageCache } from './server/afterimage-cache.mjs';
import { requestAfterimageGeneration } from './server/afterimage-generation.mjs';
import { createGuestAllowance } from './server/guest-allowance.mjs';
import { createStatusCache } from './server/status-cache.mjs';
import { createPublicQuota } from './server/public-quota.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(root, 'public');
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2':'font/woff2', '.bin':'application/octet-stream', '.glb':'model/gltf-binary', '.txt': 'text/plain; charset=utf-8', '.glsl':'text/plain; charset=utf-8', '.vert':'text/plain; charset=utf-8', '.frag':'text/plain; charset=utf-8', '.webmanifest':'application/manifest+json', '.webm':'video/webm', '.ogg':'audio/ogg' };

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function writeSpeechRecord(response,value,signal) {
  signal.throwIfAborted();
  if(!response.write(`${JSON.stringify(value)}\n`))await once(response,'drain',{signal});
}

function readJson(request,limit=16384) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let failed = false;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        if (!failed) reject(Object.assign(new Error('Request is too large.'), { status: 413 }));
        failed = true;
      } else if (!failed) chunks.push(chunk);
    });
    request.on('end', () => {
      if (failed) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Send valid JSON.'), { status: 400 })); }
    });
    request.on('error', reject);
  });
}

function chatFailure(error,task='chat'){
  const categories=['quota','credentials','provider_http','invalid_json','model_access','output_limit','finish_reason'];
  const reason=categories.includes(error.code)?error.code:error.name==='SyntaxError'?'invalid_json':error.name==='TimeoutError'?'timeout':'other';
  const code=['json_validate_failed','model_decommissioned','model_not_found','invalid_api_key','rate_limit_exceeded','insufficient_quota','invalid_request_error'].includes(error.providerCode)?error.providerCode:'unknown';
  const tag=task==='afterimage'?'afterimage':'chat';
  const stage=['response_json','packet_json','packet_schema'].includes(error.failureStage)?error.failureStage:null;
  console.warn(`[NOX ${tag}] reason=${reason} status=${Number.isInteger(error.providerStatus)?error.providerStatus:'none'} code=${code}${stage?` stage=${stage}`:''}`);
  if(tag==='afterimage'&&reason==='invalid_json')return 'The AI returned an invalid AFTERIMAGE transmission. Please receive another take.';
  if(tag==='afterimage'&&reason==='output_limit')return 'The AI could not finish the AFTERIMAGE script within its output budget. Please receive another take.';
  return {quota:'The AI provider’s free quota is temporarily exhausted. Wait for its limit to reset or choose another configured provider.',credentials:'The AI provider rejected its server key or model access. Check its account settings.',model_access:'The configured AI model is unavailable. Choose an enabled model in server settings.',output_limit:'The AI ran out of reply tokens. Try a shorter question.',invalid_json:'NOX received an unreadable reply from its AI connection. Your message is safe; please try again.',timeout:'NOX could not finish before the reply deadline. Your message is safe; please try again.'}[reason]||'NOX could not finish this reply. Check provider access or limits and try again.';
}

export function createAppServer({
  apiKey = process.env.OPENAI_API_KEY || '', model = process.env.OPENAI_MODEL || 'gpt-4.1-mini', chat = requestNox,
  speech = requestSpeech,
  speechClips = speech===requestSpeech?requestSpeechClips:async function*(input,options){yield await speech(input,options);},
  naturalVoice = process.env.NOX_NATURAL_VOICE === '1', speechVoice = process.env.NOX_SPEECH_VOICE || 'cedar',
  providers = getProviders(), defaultProvider = process.env.NOX_PROVIDER || providers[0]?.id || 'openai', providerRequest = requestProvider,
  summary = requestSummary,
  speechProvider = process.env.NOX_SPEECH_PROVIDER || 'groq', speechKey = process.env.GROQ_API_KEY || '',
  hosted = Boolean(process.env.VERCEL), accessToken = process.env.NOX_ACCESS_TOKEN || '',
  groqDeepModel = process.env.GROQ_DEEP_MODEL || 'openai/gpt-oss-120b', now = Date.now,
  guestAllowance = createGuestAllowance({now}),
  publicHosts = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.NOX_PUBLIC_ORIGIN].filter(Boolean).map(value => new URL(value.startsWith('https://') ? value : `https://${value}`).host),
} = {}) {
  let windowStart = now();
  let requests = 0;
  let publicRequests=0;
  const reserveShared=(publicTraffic=false)=>{
    if(now()-windowStart>=60000){windowStart=now();requests=0;publicRequests=0;}
    if(requests>=30||publicTraffic&&publicRequests>=24)return {wait:Math.max(1,Math.ceil((windowStart+60000-now())/1000))};
    const window=windowStart;let released=false;requests++;if(publicTraffic)publicRequests++;
    return {wait:0,release(){if(released)return;released=true;if(window!==windowStart)return;requests--;if(publicTraffic)publicRequests--;}};
  };
  const sharedWait=()=>reserveShared().wait;
  const audioCache=createCache();
  const speechClipCache=createCache();
  const afterimageCache=createAfterimageCache({now});
  const unlockThrottle=createUnlockThrottle({now});
  const statusSnapshots=createStatusCache({now});
  // Warm-process protection for anonymous polling, separate from generation quotas.
  const statusQuota=createPublicQuota({now,perClient:30,total:300});
  const takeAllowance=async(client,kind)=>{
    const decision=await guestAllowance.take(client,kind);
    if(decision.usage!==undefined)statusSnapshots.set(client,decision.usage);else statusSnapshots.invalidate(client);
    return decision;
  };
  // Reserve synchronously across the asynchronous allowance check. A rejection
  // releases the slot, and a full global gate never spends a daily allowance.
  // At most 24 anonymous text/voice generations can use the 30 shared slots.
  const admitGeneration=async(client,kind,publicTraffic)=>{
    const reservation=reserveShared(publicTraffic);
    if(reservation.wait)return {wait:reservation.wait};
    if(!publicTraffic)return {};
    try{const decision=await takeAllowance(client,kind);if(!decision.allowed)reservation.release();return {decision};}
    catch(error){reservation.release();throw error;}
  };
  const allowanceFailure=(response,decision,kind)=>{
    response.setHeader('retry-after',decision.retryAfter);
    const error=decision.code==='allowance_unavailable'?'NOX cannot check the public allowance right now. Your draft is safe; please try again shortly.':decision.code==='daily_limit'?(kind==='speech'?'This network has used its natural voice allowance for today. Text remains available within its own allowance.':'This network has used its free messages for today. Your draft is safe; the allowance resets at the time shown.'):(kind==='speech'?'NOX needs a short voice break. Text has its own allowance.':'A few replies arrived quickly. Give NOX a moment; your draft is safe.');
    return sendJson(response,decision.code==='allowance_unavailable'?503:429,{error,code:decision.code,retryAfter:decision.retryAfter,usage:decision.usage});
  };
  const available = [...providers];
  if(apiKey) available.push({id:'openai',name:'OpenAI',model});
  const preferred = available.find(p=>p.id===defaultProvider) || available[0];
  const guestBase=available.find(p=>p.id==='groq');
  const guestProvider=guestBase?{...guestBase,model:FREE_CHAT_MODEL}:null;
  const voiceKey = speechProvider==='groq' ? speechKey : apiKey;
  const hasCloud = available.length > 0 || Boolean(naturalVoice && voiceKey);
  const server = http.createServer(async (request, response) => {
    const requestStarted=now();
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'");
    const host = request.headers.host || '';
    if (hosted ? !publicHosts.includes(host) : !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return sendJson(response, 403, { error: 'Use NOX from its configured address.' });
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname); }
    catch { return sendJson(response, 400, { error: 'Invalid URL.' }); }

    const suppliedToken = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : '';
    // Vercel supplies this header at its ingress. A standalone/local server
    // uses the socket address and never trusts a caller's forwarded headers.
    const forwarded=hosted&&process.env.VERCEL?request.headers['x-vercel-forwarded-for']:'';
    const clientIP=typeof forwarded==='string'&&isIP(forwarded.trim())?forwarded.trim():request.socket.remoteAddress||'unknown';
    const bearerAttempt=Boolean(suppliedToken&&pathname.startsWith('/api/'));
    const unlockAttempt=pathname==='/api/session'&&request.method==='POST';
    const retryAfter=bearerAttempt||unlockAttempt?unlockThrottle.retryAfter(clientIP):0;
    if(retryAfter){response.setHeader('retry-after',retryAfter);return sendJson(response,429,{error:'Too many unsuccessful unlocks. Wait a few minutes and try again.'});}
    const digest = value => createHash('sha256').update(value).digest();
    const bearerAccepted=Boolean(accessToken&&suppliedToken&&timingSafeEqual(digest(suppliedToken),digest(accessToken)));
    if(bearerAttempt){if(bearerAccepted)unlockThrottle.clear(clientIP);else unlockThrottle.fail(clientIP);}
    const authorized=suppliedToken?bearerAccepted:validSession(sessionFromCookie(request.headers.cookie,hosted),accessToken,host,now());
    const requestedGuest=request.headers['x-nox-guest']==='1';
    const owner=!requestedGuest&&(authorized||!hosted&&!accessToken);
    const locked = Boolean(hasCloud && (hosted || accessToken) && !owner);
    const sharedFailure=(wait,error)=>{response.setHeader('retry-after',wait);return sendJson(response,429,{error,code:'rate_limit',retryAfter:wait,usage:owner?null:statusSnapshots.peek(clientIP)??null});};
    if(request.headers['x-nox-owner']==='1'&&!owner)return sendJson(response,401,{error:'Your owner session ended. Continue as a guest or sign in again.'});
    if(pathname==='/api/session'&&['POST','DELETE'].includes(request.method)){
      if(request.headers.origin!==`${hosted?'https':'http'}://${host}`)return sendJson(response,403,{error:'Unlock from NOX’s own page.'});
      if(request.method==='DELETE'){
        response.setHeader('set-cookie',sessionCookie('',hosted));return sendJson(response,200,{access:'locked'});
      }
      if(!bearerAccepted){if(!bearerAttempt)unlockThrottle.fail(clientIP);return sendJson(response,401,{error:'The owner token was not accepted.'});}
      response.setHeader('set-cookie',sessionCookie(mintSession(accessToken,host,now()),hosted));
      return sendJson(response,200,{access:'open'});
    }
    if (pathname === '/api/status' && request.method === 'GET') {
      if(!owner){const wait=statusQuota.take(clientIP);if(wait)return sharedFailure(wait,'Status was refreshed several times. Give NOX a moment before refreshing again.');}
      const usage=owner?null:await statusSnapshots.get(clientIP,async()=>{try{return await guestAllowance.status(clientIP);}catch{return null;}});
      return sendJson(response, 200, {
        brain: preferred && !locked ? 'live' : 'demo', model: preferred && !locked ? preferred.model : null,
        voice: voiceKey && (!locked||speechProvider==='groq') && naturalVoice ? 'natural' : 'browser', access: locked ? 'locked' : 'open',
        providers: !locked ? available : [], provider: !locked ? preferred?.id || null : null,
        owner,guestProvider,usage,
      });
    }
    if (['/api/chat','/api/speech','/api/summary','/api/afterimage'].includes(pathname) && request.method === 'POST') {
      const origin = request.headers.origin;
      if (origin && origin !== `${hosted?'https':'http'}://${host}`) return sendJson(response, 403, { error: 'Use NOX from its own page.' });
      const publicSpeech=pathname==='/api/speech'&&naturalVoice&&speechProvider==='groq'&&voiceKey;
      const guestChat=pathname==='/api/chat'&&requestedGuest&&guestProvider;
      if((guestChat||publicSpeech&&locked)&&origin!==`${hosted?'https':'http'}://${host}`)return sendJson(response,403,{error:'Use public NOX from its own page.'});
      if (locked&&!publicSpeech&&!guestChat) return sendJson(response, 401, { error: 'Unlock owner access in Settings before using cloud AI.' });
      if (!request.headers['content-type']?.startsWith('application/json')) return sendJson(response, 415, { error: 'Send application/json.' });
      try {
        const input = await readJson(request,['/api/chat','/api/summary'].includes(pathname)?CHAT_REQUEST_BYTES:16384);
        if(pathname==='/api/afterimage'){
          let creative;
          try{creative=sanitizeAfterimageInput(input);}catch{return sendJson(response,400,{error:'Send a seed of 1–600 characters, a wonder/uncanny/bold tone, and an optional variation from 0 to 1024 or configured provider.'});}
          const eligible=available.filter(p=>['groq','gemini','nvidia'].includes(p.id));
          const selected=creative.provider?eligible.find(p=>p.id===creative.provider):eligible.find(p=>p.id===preferred?.id)||eligible.find(p=>p.id==='groq')||eligible[0];
          if(!selected)return sendJson(response,503,{error:'Configure a Groq, Gemini or NVIDIA server key to receive an AFTERIMAGE.'});
          const wait=sharedWait();if(wait)return sharedFailure(wait,'Give NOX a moment before receiving another AFTERIMAGE.');
          const controller=new AbortController(),started=performance.now(),selectedModel=modelForDepth(selected.id,selected.model,'quick');
          response.on('close',()=>{if(!response.writableEnded)controller.abort();});
          const key=createHash('sha256').update(JSON.stringify([host,creative.seed,creative.tone,creative.variation,selected.id,selectedModel])).digest('hex');
          try{
            const {value:generation,hit}=await afterimageCache.getOrCreate(key,async sharedSignal=>{
              const signal=AbortSignal.any([sharedSignal,AbortSignal.timeout(20000)]);
              return requestAfterimageGeneration(()=>providerRequest(creative,{provider:selected.id,apiKey:providerKey(selected.id),model:selectedModel,task:'afterimage',signal}),{signal});
            },{signal:controller.signal});
            if(controller.signal.aborted)return;
            return sendJson(response,200,{packet:generation.packet,metrics:{provider:selected.name,model:selectedModel,totalMs:Math.round(performance.now()-started),cacheHit:hit,attempts:generation.attempts}});
          }catch(error){
            if(controller.signal.aborted)return;
            if(error.code==='busy')return sendJson(response,429,{error:'AFTERIMAGE is receiving other signals. Try again shortly.'});
            return sendJson(response,502,{error:chatFailure(error,'afterimage')});
          }
        }
        if (pathname === '/api/speech') {
          if (!voiceKey || !naturalVoice) return sendJson(response,503,{error:'Natural voice is not configured. Browser voice is still available.'});
          if (!input || typeof input.text !== 'string' || !input.text.trim() || input.text.length>420) return sendJson(response,400,{error:'Speech must contain 1–420 characters.'});
          let speechCues;try{speechCues=normalizeSpeechCues(input.text,input.speechCues);}catch{return sendJson(response,400,{error:'Speech cues must match four bounded script lines and known emotions.'});}
          const admission=await admitGeneration(clientIP,'speech',!owner);
          if(admission.wait)return sharedFailure(admission.wait,'Give NOX a moment before requesting more voice.');
          if(admission.decision){if(!admission.decision.allowed)return allowanceFailure(response,admission.decision,'speech');response.setHeader('x-nox-usage',JSON.stringify(admission.decision.usage));}
          const controller=input.stream===true?new AbortController():null;
          if(controller)response.once('close',()=>{if(!response.writableEnded)controller.abort();});
          try {
            const voice=speechProvider==='groq'?(['troy','austin','daniel'].includes(input.voice)?input.voice:'troy'):speechVoice;
            const acting={text:input.text.trim(),mode:sanitizeContext({mode:input.mode}).mode,emotion:EMOTIONS.includes(input.emotion)?input.emotion:'neutral',...(speechCues?{speechCues}:{})};
            // A visit ID namespaces cache entries; it never changes authorization or IP quotas.
            const visitID=request.headers['x-nox-visit-id'];
            const cacheScope=owner?'owner':`guest:${typeof visitID==='string'&&/^[a-f0-9-]{36}$/i.test(visitID)?visitID:randomUUID()}`;
            const speechOptions={apiKey:voiceKey,voice,provider:speechProvider,clipCache:speechClipCache,cacheScope};
            if(controller) {
              let count=0,size=0;
              for await(const clip of speechClips(acting,{...speechOptions,signal:controller.signal})) {
                controller.signal.throwIfAborted();
                if(!(clip instanceof Uint8Array)||!clip.byteLength||count>=4||(size+=clip.byteLength)>2*1024*1024)throw Error('Speech stream exceeded its bounded audio allowance.');
                if(!response.headersSent)response.writeHead(200,{'content-type':'application/x-ndjson; charset=utf-8','x-accel-buffering':'no'});
                await writeSpeechRecord(response,{index:count++,audio:Buffer.from(clip).toString('base64'),type:speechProvider==='groq'?'audio/wav':'audio/mpeg'},controller.signal);
              }
              if(!count)throw Error('Speech stream returned no audio.');
              await writeSpeechRecord(response,{done:true},controller.signal);
              response.end();return;
            }
            const key=createHash('sha256').update(JSON.stringify([cacheScope,voiceKey,voice,speechProvider,acting])).digest('hex');
            const {value:audio,hit}=await audioCache.getOrCreate(key,()=>speech(acting,speechOptions));
            response.writeHead(200,{'content-type':speechProvider==='groq'?'audio/wav':'audio/mpeg','x-nox-audio-cache':hit?'hit':'miss'}); response.end(audio); return;
          } catch(error) {
            if(controller?.signal.aborted||response.destroyed)return;
            const categories=['terms_required','input_limit','model_permission','quota','credentials','provider_http','invalid_audio_type'];
            const reason=categories.includes(error.code)?error.code:error.name==='TimeoutError'?'timeout':'other';
            const status=Number.isInteger(error.providerStatus)?error.providerStatus:'none';
            const format=['application/octet-stream','application/json','text/html','other'].includes(error.audioType)?error.audioType:'none';
            console.warn(`[NOX speech] reason=${reason} status=${status} format=${format}`);
            if(response.headersSent) {
              try {await writeSpeechRecord(response,{error:'Natural voice could not respond. Check model access and account limits, or choose Browser voice.'},controller.signal);}catch{/* A disconnected receiver needs no error record. */}
              if(!response.destroyed)response.end();return;
            }
            return sendJson(response,502,{error:reason==='terms_required'?'Groq requires you to review and accept the speech model’s terms in its console before Orpheus can speak. Browser voice remains available.':'Natural voice could not respond. Check model access and account limits, or choose Browser voice.'});
          }
        }
        if(pathname==='/api/summary') {
          if(!input||!Array.isArray(input.turns)||input.turns.length<1||input.turns.length>24||input.turns.some(t=>!t||!['user','assistant'].includes(t.role)||typeof t.content!=='string'||t.content.length>(t.role==='assistant'?MAX_PACKET_CHARACTERS:CHAT_INPUT_CHARACTERS))||typeof input.previous!=='undefined'&&typeof input.previous!=='string')return sendJson(response,400,{error:'Send 1–24 conversation turns and an optional previous summary.'});
          const selected=input.provider?available.find(p=>p.id===input.provider):preferred;
          if(!selected||selected.id==='openai')return sendJson(response,400,{error:'Choose a configured Groq, Gemini or NVIDIA provider for summaries.'});
          const wait=sharedWait();if(wait)return sharedFailure(wait,'Give NOX a moment before summarizing more conversation.');
          const controller=new AbortController(),disconnect=()=>{if(!response.writableEnded)controller.abort();};
          request.once('aborted',disconnect);response.once('close',disconnect);
          if(request.aborted||response.destroyed)controller.abort();
          try{
            if(controller.signal.aborted)return;
            const value=await summary(input,{provider:selected.id,apiKey:providerKey(selected.id),model:selected.model,signal:controller.signal});
            if(!controller.signal.aborted&&!response.destroyed)return sendJson(response,200,{summary:value});
          }catch{
            if(!controller.signal.aborted&&!response.destroyed)return sendJson(response,502,{error:'The conversation summary could not finish. Your saved transcript is unchanged.'});
          }finally{request.off('aborted',disconnect);response.off('close',disconnect);}
          return;
        }
        const messageLimit=CHAT_INPUT_CHARACTERS;
        if (!input || typeof input.message !== 'string' || !input.message.trim() || input.message.length > messageLimit) {
          return sendJson(response, 400, { error: `Message must contain 1–${messageLimit} characters.` });
        }
        if (!preferred) return sendJson(response, 503, { error: 'Add a Groq, Gemini, or NVIDIA API key to server environment settings and restart or redeploy NOX.' });
        if(guestChat&&input.provider&&input.provider!=='groq')return sendJson(response,400,{error:'NOX Free uses its configured public connection.'});
        const selected = guestChat?guestProvider:input.provider ? available.find(p=>p.id===input.provider) : preferred;
        if(!selected) return sendJson(response,400,{error:'That provider is not configured on this server.'});
        const admission=await admitGeneration(clientIP,'text',Boolean(guestChat));
        if(admission.wait)return sharedFailure(admission.wait,'Several requests arrived quickly. Give NOX a moment.');
        let usage=null;
        if(admission.decision){if(!admission.decision.allowed)return allowanceFailure(response,admission.decision,'text');usage=admission.decision.usage;}
        const controller=new AbortController(),budget=createChatBudget({signal:controller.signal,now,deadlineAt:requestStarted+CHAT_BUDGET_MS}),started=performance.now();
        response.on('close',()=>{if(!response.writableEnded)controller.abort();});
        try {
          const prompt = { message: input.message.trim(), context: sanitizeContext(guestChat?{...sanitizeContext(input.context),depth:input.context?.depth==='quick'?'quick':'balanced'}:input.context) };
          prompt.context.depth=answerDepth(prompt.context.depth);
          const selectedModel=modelForDepth(selected.id,selected.model,prompt.context.depth,groqDeepModel);
          let actualModel=selectedModel,fallbackReason=null;
          const options={apiKey:selected.id==='openai'?apiKey:providerKey(selected.id),model:selectedModel,signal:budget.signal,deadlineAt:budget.deadlineAt,now,provider:selected.id,deepModel:groqDeepModel,productCapabilities:capabilitiesForModel({owner,naturalVoice:Boolean(naturalVoice&&voiceKey&&(!locked||speechProvider==='groq'))})};
          const generate=onText=>guestChat?requestFreeChat(prompt,{...options,onText,request:providerRequest,onModel:(model,reason)=>{actualModel=model;fallbackReason=reason;}}):selected.id==='openai'?chat(prompt,options):providerRequest(prompt,{...options,onText});
          const finish=packet=>{
            const result=normalizePacket(packet,prompt.context.depth);
            if(guestChat||!explicitMemoryRequest(prompt.message))result.memory='';
            return result;
          };
          const metrics=firstTextMs=>({firstTextMs,totalMs:Math.round(performance.now()-started),provider:selected.name,model:actualModel,...(fallbackReason?{fallbackReason}:{}),depth:prompt.context.depth});
          if(input.stream===true) {
            let firstTextMs=null,previousSpeech='';
            response.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','x-accel-buffering':'no'});response.flushHeaders();
            const emit=(event,data)=>{if(!response.destroyed)response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);};
            const onText=value=>{
              if(budget.signal.aborted)return;
              if(typeof value!=='string'||!value.trim())return;
              const speech=normalizePacket({speech:value},prompt.context.depth).speech;
              if(speech===previousSpeech)return;
              if(firstTextMs===null)firstTextMs=Math.round(performance.now()-started);
              emit('text',speech.startsWith(previousSpeech)?{delta:speech.slice(previousSpeech.length)}:{speech});previousSpeech=speech;
            };
            try {
              const packet=finish(await budget.run(()=>generate(onText)));
              onText(packet.speech);
              emit('final',{...packet,metrics:metrics(firstTextMs),usage});
            }catch(error) {if(!controller.signal.aborted)emit('error',{error:chatFailure(error),usage});}
            response.end();return;
          }
          const packet = await budget.run(()=>generate());
          if(controller.signal.aborted)return;
          return sendJson(response, 200, {...finish(packet),metrics:metrics(Math.round(performance.now()-started)),usage});
        } catch(error) {
          if(controller.signal.aborted||response.destroyed)return;
          return sendJson(response, 502, { error: chatFailure(error), usage });
        }finally{budget.dispose();}
      } catch (error) {
        return sendJson(response, error.status || 400, { error: error.status === 413 ? 'Request is too large.' : 'Send valid JSON.' });
      }
    }
    if (!['GET', 'HEAD'].includes(request.method)) return sendJson(response, 405, { error: 'Method not allowed.' });

    // Only public assets and these exact shared modules are readable over HTTP.
    let file;
    if (['/shared/character.js','/shared/afterimage.js','/shared/interface-state.js'].includes(pathname)) file = path.join(root, 'shared', path.basename(pathname));
    else {
      file = path.resolve(publicRoot, pathname === '/' ? 'index.html' : ['/app','/app/','/guest','/guest/','/owner','/owner/'].includes(pathname)?'app.html':`.${pathname}`);
      if (!file.startsWith(publicRoot + path.sep) || pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) return sendJson(response, 404, { error: 'Not found.' });
    }
    const type = contentTypes[path.extname(file)];
    if (!type) return sendJson(response, 404, { error: 'Not found.' });
    try {
      const content = await readFile(file);
      if(/^\/dist\/chunks\/[\w-]+-[A-Z0-9]{8}\.js$/.test(pathname)||/^\/assets\/nox\/body-v\d+\.glb$/.test(pathname))response.setHeader('cache-control','public, max-age=31536000, immutable');
      response.writeHead(200, { 'content-type': type });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch { sendJson(response, 404, { error: 'Not found.' }); }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const server = createAppServer();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is occupied. Set another PORT in .env.` : 'NOX could not start its local server.');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`NOX / First contact\nOpen http://127.0.0.1:${port}\nBrain: ${getProviders().length || process.env.OPENAI_API_KEY ? 'AI provider configured' : 'offline demo — add a server API key for live conversation'}\nPress Ctrl+C to stop.`);
  });
}
