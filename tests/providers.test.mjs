import test from 'node:test';
import assert from 'node:assert/strict';
import { getProviders, requestProvider } from '../server/providers.mjs';
const packet = {speech:'An original thought.',emotion:'curious',action:'none',memory:''};

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
