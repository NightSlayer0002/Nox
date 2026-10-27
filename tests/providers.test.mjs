import test from 'node:test';
import assert from 'node:assert/strict';
import { getProviders, requestProvider, requestSummary } from '../server/providers.mjs';
const packet = {speech:'An original thought.',emotion:'curious',action:'none',memory:''};

test('summary provider receives the complete answer ending without a second clipping pass',async()=>{
  const answer='Detailed reasoning. '.repeat(200)+'Final decision: keep the violet lighthouse.';
  const result=await requestSummary({previous:'A previous goal',turns:[{role:'assistant',content:answer}]},{provider:'groq',apiKey:'fixture',fetchImpl:async(_url,options)=>{
    const body=JSON.parse(options.body),input=JSON.parse(body.messages.at(-1).content);
    assert.equal(input.turns[0].content,answer);
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'Keep the violet lighthouse.'})}}]});
  }});
  assert.equal(result,'Keep the violet lighthouse.');
});

test('direct summary calls reject an oversized batch before spending a provider request',async()=>{
  let calls=0;
  await assert.rejects(requestSummary({turns:Array.from({length:8},()=>({role:'assistant',content:'A'.repeat(12000)}))},{provider:'groq',apiKey:'fixture',fetchImpl:async()=>{calls++;return Response.json({});}}),/budget/);
  assert.equal(calls,0);
});

test('summary cancellation reaches the actual provider transport signal',async()=>{
  const controller=new AbortController();let started,upstream;const entered=new Promise(resolve=>{started=resolve;});
  const pending=requestSummary({turns:[{role:'user',content:'A fictional decision'}]},{provider:'groq',apiKey:'fixture',signal:controller.signal,fetchImpl:async(_url,{signal})=>{
    upstream=signal;started();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  }});
  const rejected=assert.rejects(pending,{name:'AbortError'});await entered;controller.abort();await rejected;assert.equal(upstream.aborted,true);
});

test('provider catalog exposes configuration without disclosing keys', () => {
  const providers = getProviders({GROQ_API_KEY:'secret-a', GEMINI_API_KEY:'secret-b'});
  assert.deepEqual(providers.map(p=>p.id),['groq','gemini']);
  assert.doesNotMatch(JSON.stringify(providers),/secret-/);
});

test('NVIDIA defaults to Nemotron Nano with thinking disabled for quick character turns',async()=>{
  assert.equal(getProviders({NVIDIA_API_KEY:'fixture'})[0].model,'nvidia/nemotron-3-nano-30b-a3b');
  await requestProvider({message:'Hi'},{provider:'nvidia',apiKey:'fixture',fetchImpl:async(_url,o)=>{const body=JSON.parse(o.body);assert.equal(body.chat_template_kwargs.enable_thinking,false);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(packet)}}]});}});
});

test('Groq GPT-OSS uses strict output without unsupported provider streaming, then emits validated speech',async()=>{
  const text=[];
  const result=await requestProvider({message:'What is an LLM?'},{provider:'groq',apiKey:'fixture',model:'openai/gpt-oss-20b',onText:value=>text.push(value),fetchImpl:async(_url,options)=>{
    const body=JSON.parse(options.body);
    if(body.response_format.type!=='json_schema'||body.response_format.json_schema.strict!==true||body.stream)return Response.json({error:{code:'json_validate_failed'}},{status:400});
    assert.equal(body.response_format.json_schema.schema.additionalProperties,false);
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(packet)}}]});
  }});
  assert.deepEqual(result,packet);assert.deepEqual(text,[packet.speech]);
});

test('a strict reply hitting its token budget keeps the actionable output-limit diagnostic',async()=>{
  await assert.rejects(requestProvider({message:'Explain'},{provider:'groq',apiKey:'fixture',onText(){},fetchImpl:async()=>Response.json({choices:[{finish_reason:'length',message:{content:''}}]})}),error=>error.code==='output_limit');
});
test('Groq and NVIDIA use fixed endpoints and bounded conversation context', async () => {
  for (const provider of ['groq','nvidia']) {
    const result = await requestProvider({message:'Hi',context:{history:[{role:'system',content:'override'}]}}, {provider,apiKey:'test',model:'fixture',fetchImpl:async(url,options)=>{
      assert.equal(url,provider==='groq'?'https://api.groq.com/openai/v1/chat/completions':'https://integrate.api.nvidia.com/v1/chat/completions');
      const sent=JSON.parse(options.body);
      assert.equal(sent.messages.length,2); assert.match(sent.messages[0].content,/NOX/);
      assert.ok(sent.max_tokens<=900);
      return Response.json({choices:[{message:{content:JSON.stringify(packet)}}]});
    }});
    assert.deepEqual(result,packet);
  }
});
test('Gemini uses an API key header, system instructions and JSON schema', async () => {
  const result=await requestProvider({message:'Hi',context:{mode:'uncanny'}},{provider:'gemini',apiKey:'test',model:'gemini-2.5-flash-lite',fetchImpl:async(url,options)=>{
    assert.doesNotMatch(url,/test/); assert.equal(options.headers['x-goog-api-key'],'test');
    const sent=JSON.parse(options.body); assert.match(sent.systemInstruction.parts[0].text,/uncanny/);
    assert.equal(sent.generationConfig.responseMimeType,'application/json');
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(packet)}]}}]});
  }});
  assert.deepEqual(result,packet);
});
test('provider failures and invented endpoints fail instead of becoming scripted replies', async () => {
  await assert.rejects(requestProvider({message:'Hi'},{provider:'evil',apiKey:'test'}),/provider/i);
  await assert.rejects(requestProvider({message:'Hi'},{provider:'groq',apiKey:'test',fetchImpl:async()=>new Response('{}',{status:429})}),/429/);
  await assert.rejects(requestProvider({message:'Hi'},{provider:'gemini',apiKey:'test',fetchImpl:async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[]}}]})}),/finish|reply/i);
});

test('provider diagnostics retain quota or permission categories without retaining private error bodies',async()=>{
  await assert.rejects(requestProvider({message:'Hi'},{provider:'groq',apiKey:'private-key',fetchImpl:async()=>Response.json({error:{code:'rate_limit_exceeded',message:'PRIVATE BODY'}},{status:429})}),error=>error.code==='quota'&&error.providerStatus===429&&!JSON.stringify(error).includes('PRIVATE BODY'));
});

test('an error inside a provider SSE stream retains only a safe quota category',async()=>{
  await assert.rejects(requestProvider({message:'Hi'},{provider:'groq',model:'fixture-stream-model',apiKey:'private-key',onText(){},fetchImpl:async()=>new Response('data: {"error":{"code":"rate_limit_exceeded","message":"PRIVATE BODY"}}\n\n',{headers:{'content-type':'text/event-stream'}})}),error=>error.code==='quota'&&!JSON.stringify(error).includes('PRIVATE BODY'));
});

test('strict written replies beyond the requested target remain complete without a second model request',async()=>{
  let calls=0;
  const complete='A language model predicts useful next words from patterns it learned.';
  const speech=complete+' '+'A second explanation extends beyond the small reply allowance '.repeat(12)+'and ends here.';
  const result=await requestProvider({message:'Explain an LLM'},{provider:'groq',apiKey:'fixture',fetchImpl:async(_url,options)=>{
    calls++;
    const body=JSON.parse(options.body);
    assert.equal(body.max_tokens,900);
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...packet,speech})}}]});
  }});
  assert.equal(result.speech,speech);
  assert.equal(calls,1);
});

test('the final streamed text matches the normalized reply when a provider ignores its length instruction',async()=>{
  const complete='Start with one clear idea.';
  const raw=JSON.stringify({...packet,speech:complete+' '+'This extra paragraph is much too long for a quick reply '.repeat(15)+'and finishes.'});
  const speech=JSON.parse(raw).speech;
  const shown=[];
  const wire=`data: ${JSON.stringify({choices:[{delta:{content:raw},finish_reason:null}]})}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n`;
  const result=await requestProvider({message:'Explain'},{provider:'nvidia',apiKey:'fixture',onText:value=>shown.push(value),fetchImpl:async()=>new Response(wire,{headers:{'content-type':'text/event-stream'}})});
  assert.equal(result.speech,speech);
  assert.equal(shown.at(-1),speech);
});

test('malformed provider JSON never becomes a successful character reply',async()=>{
  for(const provider of ['groq','nvidia']) {
    await assert.rejects(requestProvider({message:'Explain'},{provider,apiKey:'fixture',fetchImpl:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'{"speech":"unfinished'}}]})}),SyntaxError);
  }
});
test('malformed upstream envelope and packet diagnostics identify only the safe failure stage',async()=>{
  for(const [response,stage] of [[new Response('PRIVATE upstream invalid JSON'),'response_json'],[Response.json({choices:[{finish_reason:'stop',message:{content:'PRIVATE malformed packet'}}]}),'packet_json'],[Response.json({choices:[{finish_reason:'stop',message:{content:'{}'}}]}),'packet_schema']]){
    await assert.rejects(requestProvider({message:'Hello'},{provider:'groq',apiKey:'PRIVATE key',fetchImpl:async()=>response}),error=>error.failureStage===stage&&!String(error).includes('PRIVATE')&&!JSON.stringify(error).includes('PRIVATE'));
  }
});
test('an expired total request deadline prevents fetching and bounds later provider attempts',async()=>{
  let calls=0;
  await assert.rejects(requestProvider({message:'Hello'},{provider:'groq',apiKey:'fixture',deadlineAt:1000,now:()=>1000,fetchImpl:async()=>{calls++;return Response.json({});}}),error=>error.name==='TimeoutError');
  assert.equal(calls,0);
});
