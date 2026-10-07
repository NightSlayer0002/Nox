import http from 'node:http';
import { isIP } from 'node:net';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizePacket, sanitizeContext, answerDepth, EMOTIONS } from './shared/character.js';
import { requestNox, explicitMemoryRequest } from './server/ai.mjs';
import { getProviders, providerKey, requestProvider, requestSummary, modelForDepth } from './server/providers.mjs';
import { createCache } from './server/cache.mjs';
import { requestSpeech } from './server/speech.mjs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mintSession, validSession, sessionFromCookie, sessionCookie, createUnlockThrottle } from './server/session.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(root, 'public');
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let failed = false;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > 16384) {
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

function chatFailure(error){
  const categories=['quota','credentials','provider_http','invalid_json','model_access','output_limit','finish_reason'];
  const reason=categories.includes(error.code)?error.code:error.name==='SyntaxError'?'invalid_json':error.name==='TimeoutError'?'timeout':'other';
  const code=['json_validate_failed','model_decommissioned','model_not_found','invalid_api_key','rate_limit_exceeded','insufficient_quota','invalid_request_error'].includes(error.providerCode)?error.providerCode:'unknown';
  console.warn(`[NOX chat] reason=${reason} status=${Number.isInteger(error.providerStatus)?error.providerStatus:'none'} code=${code}`);
  return {quota:'The AI provider’s free quota is temporarily exhausted. Wait for its limit to reset or choose another configured provider.',credentials:'The AI provider rejected its server key or model access. Check its account settings.',model_access:'The configured AI model is unavailable. Choose an enabled model in server settings.',output_limit:'The AI ran out of reply tokens. Try a shorter question.',invalid_json:'The AI returned an invalid character reply. Please try again.'}[reason]||'NOX could not finish this reply. Check provider access or limits and try again.';
}

export function createAppServer({
  apiKey = process.env.OPENAI_API_KEY || '', model = process.env.OPENAI_MODEL || 'gpt-4.1-mini', chat = requestNox,
  speech = requestSpeech, naturalVoice = process.env.NOX_NATURAL_VOICE === '1', speechVoice = process.env.NOX_SPEECH_VOICE || 'cedar',
  providers = getProviders(), defaultProvider = process.env.NOX_PROVIDER || providers[0]?.id || 'openai', providerRequest = requestProvider,
  summary = requestSummary,
  speechProvider = process.env.NOX_SPEECH_PROVIDER || 'groq', speechKey = process.env.GROQ_API_KEY || '',
  hosted = Boolean(process.env.VERCEL), accessToken = process.env.NOX_ACCESS_TOKEN || '',
  groqDeepModel = process.env.GROQ_DEEP_MODEL || 'openai/gpt-oss-120b', now = Date.now,
  publicHosts = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.NOX_PUBLIC_ORIGIN].filter(Boolean).map(value => new URL(value.startsWith('https://') ? value : `https://${value}`).host),
} = {}) {
  let windowStart = Date.now();
  let requests = 0;
  const audioCache=createCache();
  const unlockThrottle=createUnlockThrottle({now});
  const available = [...providers];
  if(apiKey) available.push({id:'openai',name:'OpenAI',model});
  const preferred = available.find(p=>p.id===defaultProvider) || available[0];
  const voiceKey = speechProvider==='groq' ? speechKey : apiKey;
  const hasCloud = available.length > 0 || Boolean(naturalVoice && voiceKey);
  const server = http.createServer(async (request, response) => {
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
    const locked = Boolean(hasCloud && (hosted || accessToken) && !authorized);
    if(pathname==='/api/session'&&['POST','DELETE'].includes(request.method)){
      if(request.headers.origin!==`${hosted?'https':'http'}://${host}`)return sendJson(response,403,{error:'Unlock from NOX’s own page.'});
      if(request.method==='DELETE'){
        response.setHeader('set-cookie',sessionCookie('',hosted));return sendJson(response,200,{access:'locked'});
      }
      if(!bearerAccepted){if(!bearerAttempt)unlockThrottle.fail(clientIP);return sendJson(response,401,{error:'The owner token was not accepted.'});}
      response.setHeader('set-cookie',sessionCookie(mintSession(accessToken,host,now()),hosted));
      return sendJson(response,200,{access:'open'});
    }
    if (pathname === '/api/status' && request.method === 'GET') return sendJson(response, 200, {
      brain: preferred && !locked ? 'live' : 'demo', model: preferred && !locked ? preferred.model : null,
      voice: voiceKey && !locked && naturalVoice ? 'natural' : 'browser', access: locked ? 'locked' : 'open',
      providers: !locked ? available : [], provider: !locked ? preferred?.id || null : null,
    });
    if (['/api/chat','/api/speech','/api/summary'].includes(pathname) && request.method === 'POST') {
      const origin = request.headers.origin;
      if (origin && origin !== `${hosted?'https':'http'}://${host}`) return sendJson(response, 403, { error: 'Use NOX from its own page.' });
      if (locked) return sendJson(response, 401, { error: 'Unlock owner access in Settings before using cloud AI or natural voice.' });
      if (!request.headers['content-type']?.startsWith('application/json')) return sendJson(response, 415, { error: 'Send application/json.' });
      try {
        const input = await readJson(request);
        if (pathname === '/api/speech') {
          if (!voiceKey || !naturalVoice) return sendJson(response,503,{error:'Natural voice is not configured. Browser voice is still available.'});
          if (!input || typeof input.text !== 'string' || !input.text.trim() || input.text.length>420) return sendJson(response,400,{error:'Speech must contain 1–420 characters.'});
          if (Date.now()-windowStart>60000) {windowStart=Date.now();requests=0;}
          if(++requests>30) return sendJson(response,429,{error:'Give NOX a moment before requesting more voice.'});
          try {
            const voice=speechProvider==='groq'&&['troy','austin','daniel','hannah'].includes(input.voice)?input.voice:speechVoice;
            const acting={text:input.text.trim(),mode:sanitizeContext({mode:input.mode}).mode,emotion:EMOTIONS.includes(input.emotion)?input.emotion:'neutral'};
            const key=createHash('sha256').update(JSON.stringify([voiceKey,voice,speechProvider,acting])).digest('hex');
            const {value:audio,hit}=await audioCache.getOrCreate(key,()=>speech(acting,{apiKey:voiceKey,voice,provider:speechProvider}));
            response.writeHead(200,{'content-type':speechProvider==='groq'?'audio/wav':'audio/mpeg','x-nox-audio-cache':hit?'hit':'miss'}); response.end(audio); return;
          } catch(error) {
            const categories=['terms_required','input_limit','model_permission','quota','credentials','provider_http','invalid_audio_type'];
            const reason=categories.includes(error.code)?error.code:error.name==='TimeoutError'?'timeout':'other';
            const status=Number.isInteger(error.providerStatus)?error.providerStatus:'none';
            const format=['application/octet-stream','application/json','text/html','other'].includes(error.audioType)?error.audioType:'none';
            console.warn(`[NOX speech] reason=${reason} status=${status} format=${format}`);
            return sendJson(response,502,{error:reason==='terms_required'?'Groq requires you to review and accept the speech model’s terms in its console before Orpheus can speak. Browser voice remains available.':'Natural voice could not respond. Check model access and account limits, or choose Browser voice.'});
          }
        }
        if(pathname==='/api/summary') {
          if(!input||!Array.isArray(input.turns)||input.turns.length<1||input.turns.length>24||input.turns.some(t=>!t||!['user','assistant'].includes(t.role)||typeof t.content!=='string'||t.content.length>1200)||typeof input.previous!=='undefined'&&typeof input.previous!=='string')return sendJson(response,400,{error:'Send 1–24 conversation turns and an optional previous summary.'});
          const selected=input.provider?available.find(p=>p.id===input.provider):preferred;
          if(!selected||selected.id==='openai')return sendJson(response,400,{error:'Choose a configured Groq, Gemini or NVIDIA provider for summaries.'});
          if(Date.now()-windowStart>60000){windowStart=Date.now();requests=0;}
          if(++requests>30)return sendJson(response,429,{error:'Give NOX a moment before summarizing more conversation.'});
          try {return sendJson(response,200,{summary:await summary(input,{provider:selected.id,apiKey:providerKey(selected.id),model:selected.model})});}
          catch{return sendJson(response,502,{error:'The conversation summary could not finish. Your saved transcript is unchanged.'});}
        }
        if (!input || typeof input.message !== 'string' || !input.message.trim() || input.message.length > 1200) {
          return sendJson(response, 400, { error: 'Message must contain 1–1200 characters.' });
        }
        if (!preferred) return sendJson(response, 503, { error: 'Add a Groq, Gemini, or NVIDIA API key to server environment settings and restart or redeploy NOX.' });
        const selected = input.provider ? available.find(p=>p.id===input.provider) : preferred;
        if(!selected) return sendJson(response,400,{error:'That provider is not configured on this server.'});
        if (Date.now() - windowStart > 60000) { windowStart = Date.now(); requests = 0; }
        if (++requests > 30) return sendJson(response, 429, { error: 'Thirty turns in a minute. Give NOX a moment.' });
        try {
          const prompt = { message: input.message.trim(), context: sanitizeContext(input.context) };
          prompt.context.depth=answerDepth(prompt.context.depth);
          const selectedModel=modelForDepth(selected.id,selected.model,prompt.context.depth,groqDeepModel);
          const controller=new AbortController(),started=performance.now();
          response.on('close',()=>{if(!response.writableEnded)controller.abort();});
          const options={apiKey:selected.id==='openai'?apiKey:providerKey(selected.id),model:selectedModel,signal:controller.signal,provider:selected.id,deepModel:groqDeepModel};
          const finish=packet=>{
            const result=normalizePacket(packet,prompt.context.depth);
            if(!explicitMemoryRequest(prompt.message))result.memory='';
            return result;
          };
          const metrics=firstTextMs=>({firstTextMs,totalMs:Math.round(performance.now()-started),provider:selected.name,model:selectedModel,depth:prompt.context.depth});
          if(input.stream===true) {
            let firstTextMs=null,previousSpeech='';
            response.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','x-accel-buffering':'no'});response.flushHeaders();
            const emit=(event,data)=>{if(!response.destroyed)response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);};
            const onText=value=>{
              if(typeof value!=='string'||!value.trim())return;
              const speech=normalizePacket({speech:value},prompt.context.depth).speech;
              if(speech===previousSpeech)return;
              if(firstTextMs===null)firstTextMs=Math.round(performance.now()-started);
              emit('text',speech.startsWith(previousSpeech)?{delta:speech.slice(previousSpeech.length)}:{speech});previousSpeech=speech;
            };
            try {
              const packet=finish(selected.id==='openai'?await chat(prompt,options):await providerRequest(prompt,{...options,onText}));
              onText(packet.speech);
              emit('final',{...packet,metrics:metrics(firstTextMs)});
            }catch(error) {if(!controller.signal.aborted)emit('error',{error:chatFailure(error)});}
            response.end();return;
          }
          const packet = selected.id==='openai' ? await chat(prompt,options) : await providerRequest(prompt,options);
          if(controller.signal.aborted)return;
          return sendJson(response, 200, {...finish(packet),metrics:metrics(Math.round(performance.now()-started))});
        } catch(error) {
          return sendJson(response, 502, { error: chatFailure(error) });
        }
      } catch (error) {
        return sendJson(response, error.status || 400, { error: error.status === 413 ? 'Request is too large.' : 'Send valid JSON.' });
      }
    }
    if (!['GET', 'HEAD'].includes(request.method)) return sendJson(response, 405, { error: 'Method not allowed.' });

    // Only public assets and this exact shared module are readable over HTTP.
    let file;
    if (pathname === '/shared/character.js') file = path.join(root, 'shared', 'character.js');
    else {
      file = path.resolve(publicRoot, pathname === '/' ? 'index.html' : ['/app','/app/'].includes(pathname)?'app.html':`.${pathname}`);
      if (!file.startsWith(publicRoot + path.sep) || pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) return sendJson(response, 404, { error: 'Not found.' });
    }
    const type = contentTypes[path.extname(file)];
    if (!type) return sendJson(response, 404, { error: 'Not found.' });
    try {
      const content = await readFile(file);
      if(/^\/dist\/chunks\/[\w-]+-[A-Z0-9]{8}\.js$/.test(pathname))response.setHeader('cache-control','public, max-age=31536000, immutable');
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
