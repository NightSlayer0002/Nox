import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAppServer } from '../server.mjs';
import { requestProvider } from '../server/providers.mjs';

const cue = (speech='The moon answers.',emotion='curious',action='orbit') => ({speech,emotion,action});
const transmission = () => ({
  title:'The unanswered moon',anchor:'A radio beneath the sea receives tomorrow’s weather.',
  signals:[0,1,2].map(index=>({label:`Signal ${index+1}`,premise:'A listener follows the strange broadcast.',
    beats:[cue('A radio wakes.'),cue('Someone knows your name.','uncanny','echo'),cue('The signal waits.','skeptical','spotlight')],
    endings:[{label:'Answer',...cue('You speak into the static.','happy','takeover')},{label:'Leave',...cue('The ocean keeps the secret.','sleepy','none')}]})),
  caption:'A fictional transmission. Which ending will you make?',
});
const providerResponse = value => Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
const validationFailure = () => Object.assign(new Error('PRIVATE provider output'),{code:'invalid_json',providerStatus:400,providerCode:'json_validate_failed'});

test('AFTERIMAGE generation validates one successful attempt and reports its count',async()=>{
  const {requestAfterimageGeneration}=await import('../server/afterimage-generation.mjs');
  let calls=0;const value=transmission();value.signals[0].beats[0].action='run_shell';
  const result=await requestAfterimageGeneration(async()=>{calls++;return value;});
  assert.equal(calls,1);assert.equal(result.attempts,1);assert.equal(result.packet.signals[0].beats[0].action,'none');
});

test('AFTERIMAGE generation retries the confirmed provider validation failure once',async()=>{
  const {requestAfterimageGeneration}=await import('../server/afterimage-generation.mjs');
  let calls=0;const result=await requestAfterimageGeneration(async()=>{if(++calls===1)throw validationFailure();return transmission();});
  assert.equal(calls,2);assert.equal(result.attempts,2);assert.equal(result.packet.title,'The unanswered moon');
});

test('AFTERIMAGE generation never makes a third attempt after repeat validation failure',async()=>{
  const {requestAfterimageGeneration}=await import('../server/afterimage-generation.mjs');
  let calls=0;const error=validationFailure();
  await assert.rejects(requestAfterimageGeneration(async()=>{calls++;throw error;}),received=>received===error);
  assert.equal(calls,2);
});

test('AFTERIMAGE generation does not retry parsing, packet, quota, credentials, limits or timeout failures',async()=>{
  const {requestAfterimageGeneration}=await import('../server/afterimage-generation.mjs');
  const errors=[new SyntaxError('PRIVATE JSON'),new TypeError('PRIVATE packet'),
    Object.assign(new TypeError('PRIVATE type'),{code:'invalid_json',providerStatus:400,providerCode:'json_validate_failed'}),
    Object.assign(new Error('quota'),{code:'quota',providerStatus:429,providerCode:'rate_limit_exceeded'}),
    Object.assign(new Error('credentials'),{code:'credentials',providerStatus:401,providerCode:'invalid_api_key'}),
    Object.assign(new Error('limit'),{code:'output_limit'}),new DOMException('timeout','TimeoutError'),
    Object.assign(new Error('wrong status'),{code:'invalid_json',providerStatus:502,providerCode:'json_validate_failed'}),
    Object.assign(new Error('wrong provider code'),{code:'invalid_json',providerStatus:400,providerCode:'unknown'})];
  for(const error of errors){let calls=0;await assert.rejects(requestAfterimageGeneration(async()=>{calls++;throw error;}),received=>received===error);assert.equal(calls,1);}
  let calls=0;await assert.rejects(requestAfterimageGeneration(async()=>{calls++;return {title:'incomplete'};}),TypeError);assert.equal(calls,1);
});

test('AFTERIMAGE generation checks cancellation before work, after a reply and before retry',async()=>{
  const {requestAfterimageGeneration}=await import('../server/afterimage-generation.mjs');
  const already=new AbortController();already.abort();let calls=0;
  await assert.rejects(requestAfterimageGeneration(async()=>{calls++;return transmission();},{signal:already.signal}),error=>error.name==='AbortError');assert.equal(calls,0);
  for(const fail of [false,true]){
    const controller=new AbortController();calls=0;
    await assert.rejects(requestAfterimageGeneration(async()=>{calls++;controller.abort();if(fail)throw validationFailure();return transmission();},{signal:controller.signal}),error=>error.name==='AbortError');
    assert.equal(calls,1);
  }
});

test('AFTERIMAGE generation uses the same cancellation deadline during its second attempt',async()=>{
  const {requestAfterimageGeneration}=await import('../server/afterimage-generation.mjs');
  const controller=new AbortController();let calls=0,secondStarted;
  const began=new Promise(resolve=>{secondStarted=resolve;});
  const pending=requestAfterimageGeneration(async()=>{
    if(++calls===1)throw validationFailure();secondStarted();
    return new Promise((_resolve,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true}));
  },{signal:controller.signal});
  const rejected=assert.rejects(pending,error=>error.name==='TimeoutError');await began;
  controller.abort(new DOMException('shared deadline','TimeoutError'));await rejected;assert.equal(calls,2);
});

test('AFTERIMAGE normalizes exact playable counts and bounds every text field',async()=>{
  const {normalizeAfterimage}=await import('../shared/afterimage.js');
  const input=transmission();input.title='x'.repeat(100);input.anchor='a'.repeat(200);input.caption='c'.repeat(300);
  input.signals[0].label='l'.repeat(60);input.signals[0].premise='p'.repeat(200);
  input.signals[0].beats[0]=cue('s'.repeat(100),'invented','run_shell');
  input.signals[0].endings[0].label='e'.repeat(60);
  const packet=normalizeAfterimage(input);
  assert.equal(packet.title.length,80);assert.equal(packet.anchor.length,160);assert.equal(packet.caption.length,280);
  assert.equal(packet.signals.length,3);assert.equal(packet.signals[0].label.length,48);assert.equal(packet.signals[0].premise.length,180);
  assert.equal(packet.signals[0].beats.length,3);assert.equal(packet.signals[0].endings.length,2);
  assert.deepEqual(packet.signals[0].beats[0],{speech:'s'.repeat(90),emotion:'neutral',action:'none'});
  assert.equal(packet.signals[0].endings[0].label.length,48);
  assert.notEqual(packet.signals,input.signals);
});

test('AFTERIMAGE rejects incomplete, surplus, empty and unexpected structures',async()=>{
  const {normalizeAfterimage}=await import('../shared/afterimage.js');
  const mutations=[p=>delete p.anchor,p=>p.signals.pop(),p=>p.signals.push(p.signals[0]),p=>p.signals[0].beats.pop(),
    p=>p.signals[0].endings.push(p.signals[0].endings[0]),p=>p.signals[0].beats[0].speech='  ',
    p=>p.signals[0].beats[0].execute='alert(1)',p=>p.signals[0].endings[0].url='https://example.com',
    p=>p.signals[0].label=3,p=>p.extra='unexpected',p=>delete p.signals[0].beats[0].emotion];
  for(const mutate of mutations){const input=transmission();mutate(input);assert.throws(()=>normalizeAfterimage(input),TypeError);}
  for(const value of [null,[],{},'text'])assert.throws(()=>normalizeAfterimage(value),TypeError);
});

test('AFTERIMAGE input accepts only a bounded seed, known tone, integer variation and provider ID',async()=>{
  const {sanitizeAfterimageInput}=await import('../shared/afterimage.js');
  assert.deepEqual(sanitizeAfterimageInput({seed:'  a moon  ',tone:'wonder'}),{seed:'a moon',tone:'wonder',variation:0});
  assert.deepEqual(sanitizeAfterimageInput({seed:'x'.repeat(600),tone:'bold',variation:1024,provider:'groq'}),{seed:'x'.repeat(600),tone:'bold',variation:1024,provider:'groq'});
  const invalid=[null,[],{seed:' ',tone:'wonder'},{seed:'x'.repeat(601),tone:'wonder'},
    {seed:'moon',tone:'danger'},{seed:'moon',tone:'wonder',variation:-1},{seed:'moon',tone:'wonder',variation:1025},
    {seed:'moon',tone:'wonder',variation:1.2},{seed:'moon',tone:'wonder',provider:'https://evil.example'},
    {seed:'moon',tone:'wonder',provider:'openai'},{seed:'moon',tone:'wonder',model:'caller-model'}];
  for(const value of invalid)assert.throws(()=>sanitizeAfterimageInput(value),TypeError);
});

test('Groq AFTERIMAGE makes one low-reasoning strict packet without conversation context or streaming',async()=>{
  const result=await requestProvider({seed:'A listening moon',tone:'wonder',variation:4,context:{history:[{role:'user',content:'PRIVATE TRANSCRIPT'}]}},
    {provider:'groq',apiKey:'fixture',task:'afterimage',onText(){throw Error('must not stream');},fetchImpl:async(url,options)=>{
      const body=JSON.parse(options.body);
      assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
      assert.equal(body.model,'openai/gpt-oss-20b');assert.equal(body.reasoning_effort,'low');assert.ok(body.max_tokens>=2400&&body.max_tokens<=3000);
      assert.equal(body.response_format.type,'json_schema');assert.equal(body.response_format.json_schema.strict,true);
      assert.equal(body.response_format.json_schema.schema.properties.signals.minItems,3);
      assert.equal(body.messages.length,2);assert.equal(body.stream,undefined);
      assert.doesNotMatch(JSON.stringify(body),/PRIVATE TRANSCRIPT/);assert.match(body.messages[0].content,/fiction/i);
      assert.deepEqual(JSON.parse(body.messages[1].content),{seed:'A listening moon',tone:'wonder',variation:4});
      return providerResponse(transmission());
    }});
  assert.equal(result.signals[2].endings[1].speech,'The ocean keeps the secret.');
});

test('Gemini AFTERIMAGE receives nested schema and validates all branches before returning',async()=>{
  const result=await requestProvider({seed:'Ocean radio',tone:'uncanny',variation:0},{provider:'gemini',apiKey:'fixture',task:'afterimage',onText(){throw Error('must not stream');},fetchImpl:async(url,options)=>{
    assert.match(url,/:generateContent$/);const body=JSON.parse(options.body),schema=body.generationConfig.responseSchema;
    assert.equal(schema.properties.signals.type,'ARRAY');assert.equal(schema.properties.signals.minItems,3);
    assert.equal(schema.properties.signals.items.properties.beats.items.properties.action.type,'STRING');
    assert.ok(schema.properties.signals.items.properties.beats.items.properties.action.enum.includes('echo'));
    assert.equal(body.contents.length,1);
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(transmission())}]}}]});
  }});
  assert.equal(result.title,'The unanswered moon');
});

test('NVIDIA AFTERIMAGE keeps thinking off and rejects incomplete provider packets and non-JSON',async()=>{
  await requestProvider({seed:'Ocean radio',tone:'bold'},{provider:'nvidia',apiKey:'fixture',task:'afterimage',fetchImpl:async(_url,options)=>{
    assert.equal(JSON.parse(options.body).chat_template_kwargs.enable_thinking,false);return providerResponse(transmission());
  }});
  const invalid=transmission();invalid.signals.pop();
  await assert.rejects(requestProvider({seed:'Ocean radio',tone:'bold'},{provider:'groq',apiKey:'fixture',task:'afterimage',fetchImpl:async()=>providerResponse(invalid)}),TypeError);
  await assert.rejects(requestProvider({seed:'Ocean radio',tone:'bold'},{provider:'groq',apiKey:'fixture',task:'afterimage',fetchImpl:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'{broken'}}]})}),SyntaxError);
});

function hostedRequest(url,options={}){return new Promise((resolve,reject)=>{
  const request=http.request(url,options,response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:response.headers})));});
  request.on('error',reject);request.end(options.body);
});}
async function withServer(options,callback){
  const server=createAppServer({hosted:false,apiKey:'',providers:[],accessToken:'',defaultProvider:'groq',naturalVoice:false,speechKey:'',...options});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await callback(`http://127.0.0.1:${server.address().port}`);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
const groq={id:'groq',name:'GroqCloud',model:'openai/gpt-oss-20b'};
const post=(base,input,headers={})=>fetch(`${base}/api/afterimage`,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(input)});

test('AFTERIMAGE shares owner session, host and origin protection with chat',async()=>{
  let calls=0;await withServer({hosted:true,publicHosts:['nox.example'],providers:[groq],accessToken:'owner',providerRequest:async()=>{calls++;return transmission();}},async base=>{
    const headers={host:'nox.example',origin:'https://nox.example','content-type':'application/json'},body=JSON.stringify({seed:'A moon',tone:'wonder'});
    assert.equal((await hostedRequest(`${base}/api/afterimage`,{method:'POST',headers,body})).status,401);
    assert.equal((await hostedRequest(`${base}/api/afterimage`,{method:'POST',headers:{...headers,authorization:'Bearer owner',origin:'https://foreign.example'},body})).status,403);
    const unlock=await hostedRequest(`${base}/api/session`,{method:'POST',headers:{...headers,authorization:'Bearer owner'}});
    const cookie=unlock.headers.get('set-cookie').split(';')[0];
    const response=await hostedRequest(`${base}/api/afterimage`,{method:'POST',headers:{...headers,cookie},body});
    assert.equal(response.status,200);assert.equal((await response.json()).packet.signals.length,3);assert.equal(calls,1);
    assert.equal((await hostedRequest(`${base}/api/afterimage`,{method:'POST',headers:{...headers,host:'evil.example',cookie},body})).status,403);
  });
});

test('AFTERIMAGE rejects bad fields, media types, malformed JSON and oversized bodies before generation',async()=>{
  await withServer({providers:[groq],providerRequest:async()=>{throw Error('must not run');}},async base=>{
    const bad=[{seed:'',tone:'wonder'},{seed:'x'.repeat(601),tone:'wonder'},{seed:'moon',tone:'bad'},{seed:'moon',tone:'wonder',variation:1025},{seed:'moon',tone:'wonder',provider:'evil'}];
    for(const input of bad)assert.equal((await post(base,input)).status,400);
    assert.equal((await fetch(`${base}/api/afterimage`,{method:'POST',headers:{'content-type':'text/plain'},body:'moon'})).status,415);
    assert.equal((await fetch(`${base}/api/afterimage`,{method:'POST',headers:{'content-type':'application/json'},body:'{broken'})).status,400);
    assert.equal((await fetch(`${base}/api/afterimage`,{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(17000)})).status,413);
  });
});

test('AFTERIMAGE chooses a configured non-OpenAI provider and keeps model and data server-owned',async()=>{
  let seen;await withServer({apiKey:'paid-fixture',defaultProvider:'openai',providers:[groq,{id:'gemini',name:'Google Gemini',model:'server-model'}],providerRequest:async(input,options)=>{seen={input,options};return transmission();}},async base=>{
    const response=await post(base,{seed:'  Ocean radio  ',tone:'uncanny',provider:'gemini',variation:9});
    assert.equal(response.status,200);const data=await response.json();
    assert.deepEqual(seen.input,{seed:'Ocean radio',tone:'uncanny',variation:9,provider:'gemini'});
    assert.equal(seen.options.task,'afterimage');assert.equal(seen.options.model,'server-model');assert.equal(seen.options.onText,undefined);
    assert.equal(data.metrics.provider,'Google Gemini');assert.equal(data.metrics.model,'server-model');assert.equal(data.metrics.cacheHit,false);assert.equal(data.metrics.attempts,1);assert.ok(data.metrics.totalMs>=0);
    assert.equal((await post(base,{seed:'A moon',tone:'wonder'})).status,200);assert.equal(seen.options.provider,'groq');
    assert.equal((await post(base,{seed:'A moon',tone:'wonder',model:'caller-model'})).status,400);
  });
});

test('AFTERIMAGE returns explicit configuration errors and sanitized model failures',async()=>{
  await withServer({},async base=>assert.equal((await post(base,{seed:'A moon',tone:'wonder'})).status,503));
  await withServer({providers:[groq],providerRequest:async()=>{throw Error('PRIVATE API KEY BODY');}},async base=>{
    const failure=await post(base,{seed:'A moon',tone:'wonder'});assert.equal(failure.status,502);assert.doesNotMatch(await failure.text(),/PRIVATE/);
    assert.equal((await post(base,{seed:'A moon',tone:'wonder',provider:'gemini'})).status,503);
  });
  await withServer({providers:[groq],providerRequest:async()=>({title:'bad'})},async base=>assert.equal((await post(base,{seed:'A moon',tone:'wonder'})).status,502));
});

test('AFTERIMAGE caches identical complete requests but variation and tone start new work',async()=>{
  let calls=0;await withServer({providers:[groq],providerRequest:async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));return transmission();}},async base=>{
    const input={seed:'A moon',tone:'wonder',variation:0};
    const [one,two]=await Promise.all([post(base,input),post(base,input)]);assert.equal(one.status,200);assert.equal(two.status,200);
    const metrics=await Promise.all([one.json(),two.json()]);assert.equal(calls,1);assert.deepEqual(metrics.map(v=>v.metrics.cacheHit).sort(),[false,true]);
    assert.equal((await (await post(base,input)).json()).metrics.cacheHit,true);
    await post(base,{...input,variation:1});await post(base,{...input,tone:'bold'});assert.equal(calls,3);
  });
});

test('AFTERIMAGE API coalesces a bounded retry and preserves generation attempts in cached metadata',async()=>{
  let calls=0,firstSignal;await withServer({providers:[groq],providerRequest:async(_input,{signal})=>{
    calls++;if(calls===1){firstSignal=signal;await new Promise(resolve=>setTimeout(resolve,5));throw validationFailure();}
    if(calls===2)assert.equal(signal,firstSignal);return transmission();
  }},async base=>{
    const input={seed:'A moon',tone:'wonder'};
    const responses=await Promise.all([post(base,input),post(base,input)]);
    for(const response of responses)assert.equal(response.status,200);
    const results=await Promise.all(responses.map(response=>response.json()));
    assert.equal(calls,2);assert.deepEqual(results.map(result=>result.metrics.cacheHit).sort(),[false,true]);
    assert.deepEqual(results.map(result=>result.metrics.attempts),[2,2]);
    const cached=await (await post(base,input)).json();assert.equal(cached.metrics.cacheHit,true);assert.equal(cached.metrics.attempts,2);assert.equal(calls,2);
    const fresh=await (await post(base,{...input,tone:'bold'})).json();assert.equal(fresh.metrics.attempts,1);assert.equal(calls,3);
  });
});

test('AFTERIMAGE API sanitizes repeated validation failures with its task tag and leaves no failed cache entry',async()=>{
  let calls=0;const logs=[],originalWarn=console.warn;console.warn=value=>logs.push(value);
  try{
    await withServer({providers:[groq],providerRequest:async()=>{calls++;throw validationFailure();}},async base=>{
      for(let index=0;index<2;index++){
        const response=await post(base,{seed:'A moon',tone:'wonder'});assert.equal(response.status,502);
        const body=await response.json();assert.match(body.error,/AFTERIMAGE/);assert.doesNotMatch(body.error,/PRIVATE/);
      }
      assert.equal(calls,4);
    });
  }finally{console.warn=originalWarn;}
  assert.equal(logs.length,2);for(const log of logs){assert.match(log,/^\[NOX afterimage\] reason=invalid_json status=400 code=json_validate_failed$/);assert.doesNotMatch(log,/PRIVATE/);}
});

test('AFTERIMAGE output-limit failures keep specific safe wording and do not retry',async()=>{
  let calls=0;await withServer({providers:[groq],providerRequest:async()=>{calls++;throw Object.assign(new Error('PRIVATE output'),{code:'output_limit'});}},async base=>{
    const response=await post(base,{seed:'A moon',tone:'wonder'});assert.equal(response.status,502);
    const {error}=await response.json();assert.match(error,/AFTERIMAGE/);assert.doesNotMatch(error,/PRIVATE/);assert.equal(calls,1);
  });
});

test('AFTERIMAGE cache keys isolate providers and configured hosts',async()=>{
  let calls=0;await withServer({hosted:true,publicHosts:['one.example','two.example'],accessToken:'owner',providers:[groq,{id:'gemini',name:'Google Gemini',model:'configured-google'}],providerRequest:async()=>{calls++;return transmission();}},async base=>{
    const receive=async(host,provider)=>{
      const response=await hostedRequest(`${base}/api/afterimage`,{method:'POST',headers:{host,origin:`https://${host}`,authorization:'Bearer owner','content-type':'application/json'},body:JSON.stringify({seed:'A moon',tone:'wonder',provider})});
      assert.equal(response.status,200);return (await response.json()).metrics;
    };
    assert.equal((await receive('one.example','groq')).cacheHit,false);
    assert.equal((await receive('one.example','groq')).cacheHit,true);
    assert.equal((await receive('two.example','groq')).cacheHit,false);
    assert.equal((await receive('one.example','gemini')).cacheHit,false);assert.equal(calls,3);
  });
});

test('closing an AFTERIMAGE HTTP receiver aborts generation and the next request starts fresh',{timeout:3000},async()=>{
  let started,aborted,calls=0;
  const began=new Promise(resolve=>{started=resolve;}),cancelled=new Promise(resolve=>{aborted=resolve;});
  await withServer({providers:[groq],providerRequest:async(_input,{signal})=>{
    calls++;if(calls>1)return transmission();started();
    return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted();reject(signal.reason);},{once:true}));
  }},async base=>{
    const controller=new AbortController();
    const disconnect=fetch(`${base}/api/afterimage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({seed:'A moon',tone:'bold'}),signal:controller.signal});
    const rejection=assert.rejects(disconnect,error=>error.name==='AbortError');
    await began;controller.abort();await rejection;
    await cancelled;
    assert.equal((await post(base,{seed:'A moon',tone:'bold'})).status,200);
  });
});

test('AFTERIMAGE counts cached requests in the shared API rate limit',async()=>{
  await withServer({providers:[groq],providerRequest:async()=>transmission()},async base=>{
    for(let index=0;index<30;index++)assert.equal((await post(base,{seed:'A moon',tone:'wonder'})).status,200);
    assert.equal((await post(base,{seed:'A moon',tone:'wonder'})).status,429);
  });
});

test('only the named public shared AFTERIMAGE module is served',async()=>{
  await withServer({},async base=>{
    const response=await fetch(`${base}/shared/afterimage.js`);assert.equal(response.status,200);assert.match(await response.text(),/normalizeAfterimage/);
    assert.equal((await fetch(`${base}/shared/other.js`)).status,404);assert.equal((await fetch(`${base}/server/afterimage-cache.mjs`)).status,404);
  });
});

test('AFTERIMAGE cache expires, bounds entries and does not retain failed generations',async()=>{
  const {createAfterimageCache}=await import('../server/afterimage-cache.mjs');
  let clock=0,calls=0;const cache=createAfterimageCache({ttlMs:50,maxEntries:2,maxBytes:200000,now:()=>clock});
  const make=async()=>{calls++;return transmission();};
  await cache.getOrCreate('one',make);assert.equal((await cache.getOrCreate('one',make)).hit,true);
  clock=51;assert.equal((await cache.getOrCreate('one',make)).hit,false);
  await cache.getOrCreate('two',make);await cache.getOrCreate('three',make);assert.equal((await cache.getOrCreate('one',make)).hit,false);
  await assert.rejects(cache.getOrCreate('bad',async()=>{throw Error('failure');}));assert.equal((await cache.getOrCreate('bad',make)).hit,false);
  assert.equal(calls,6);
});

test('AFTERIMAGE cache bounds UTF-8 bytes and pending distinct jobs',async()=>{
  const {createAfterimageCache}=await import('../server/afterimage-cache.mjs');
  const bytes=createAfterimageCache({maxBytes:10});let calls=0;
  const make=async()=>{calls++;return {text:'月'.repeat(10)};};
  await bytes.getOrCreate('large',make);assert.equal((await bytes.getOrCreate('large',make)).hit,false);assert.equal(calls,2);
  const cache=createAfterimageCache({maxEntries:1});let complete;
  const pending=cache.getOrCreate('one',()=>new Promise(resolve=>{complete=resolve;}));
  const duplicate=cache.getOrCreate('one',()=>{throw Error('must coalesce');});
  await assert.rejects(cache.getOrCreate('two',async()=>transmission()),error=>error.code==='busy');
  await new Promise(resolve=>setImmediate(resolve));complete(transmission());await pending;assert.equal((await duplicate).hit,true);
  assert.equal((await cache.getOrCreate('two',async()=>transmission())).hit,false);
});

test('coalesced AFTERIMAGE receivers cancel independently and abort upstream when all leave',async()=>{
  const {createAfterimageCache}=await import('../server/afterimage-cache.mjs');
  const cache=createAfterimageCache();let complete,sharedSignal;
  const first=new AbortController(),second=new AbortController();
  const factory=signal=>{sharedSignal=signal;return new Promise(resolve=>{complete=resolve;});};
  const one=cache.getOrCreate('shared',factory,{signal:first.signal}),two=cache.getOrCreate('shared',factory,{signal:second.signal});
  const cancelled=assert.rejects(one,error=>error.name==='AbortError');await new Promise(resolve=>setImmediate(resolve));first.abort();await cancelled;
  assert.equal(sharedSignal.aborted,false);complete(transmission());assert.equal((await two).hit,true);
  const lone=new AbortController();let upstream;
  const abandoned=cache.getOrCreate('lone',signal=>{upstream=signal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));},{signal:lone.signal});
  const rejected=assert.rejects(abandoned,error=>error.name==='AbortError');await new Promise(resolve=>setImmediate(resolve));lone.abort();await rejected;assert.equal(upstream.aborted,true);
  assert.equal((await cache.getOrCreate('lone',async()=>transmission())).hit,false);
});
