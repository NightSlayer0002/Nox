import test from 'node:test';
import assert from 'node:assert/strict';
import {requestProvider} from '../server/providers.mjs';
import {requestNox} from '../server/ai.mjs';
import {requestSpeech} from '../server/speech.mjs';
import {createGuestAllowance} from '../server/guest-allowance.mjs';
import {readBoundedJson} from '../server/bounded-json.mjs';

// Question: do upstream JSON envelopes stop at their byte budget, including
// errors and canceled reads, before a tiny valid result can bypass that budget?
// Limits: synthetic Web Streams only; no provider, Redis, or socket requests.
const packet={speech:'Hello, café 👋.',emotion:'curious',action:'none',memory:''};
const envelopes={
  groq:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(packet)}}]},
  nvidia:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(packet)}}]},
  gemini:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(packet)}]}}]},
  openai:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(packet)}]}]},
};
function streamed(value,{declared=false,status=200,chunkBytes=4096}={}){
  const bytes=typeof value==='string'?new TextEncoder().encode(value):value;
  const state={read:0,canceled:false};
  const body=new ReadableStream({
    pull(controller){if(state.read===bytes.length){controller.close();return;}const end=Math.min(bytes.length,state.read+chunkBytes);controller.enqueue(bytes.subarray(state.read,end));state.read=end;},
    cancel(){state.canceled=true;},
  },{highWaterMark:0});
  return {state,response:new Response(body,{status,headers:declared?{'content-length':String(bytes.length)}:{}})};
}
const invoke=(provider,response,signal)=>provider==='openai'
  ?requestNox({message:'Synthetic'},{apiKey:'fixture',signal,fetchImpl:async()=>response})
  :requestProvider({message:'Synthetic'},{provider,apiKey:'fixture',signal,fetchImpl:async()=>response});
const safe=error=>!String(error).includes('PRIVATE')&&!JSON.stringify(error).includes('PRIVATE');

test('the JSON byte limit includes UTF-8 bytes and accepts the exact boundary',async()=>{
  const exact=streamed('{"a":"é"}',{chunkBytes:1});
  assert.deepEqual(await readBoundedJson(exact.response,{maxBytes:10}),{a:'é'});
  assert.equal(exact.response.body.locked,false);
  const over=streamed('{"a":"é"} ',{chunkBytes:1});
  await assert.rejects(readBoundedJson(over.response,{maxBytes:10}),RangeError);
  assert.equal(over.state.canceled,true);assert.equal(over.response.body.locked,false);
});

test('a false small Content-Length cannot bypass received-byte accounting',async()=>{
  const fixture=streamed('{"a":1} ');
  fixture.response.headers.set('content-length','1');
  await assert.rejects(readBoundedJson(fixture.response,{maxBytes:7}),RangeError);
  assert.equal(fixture.state.canceled,true);
});

test('malformed JSON and stream failures do not expose upstream text',async()=>{
  for(const response of [new Response('{"PRIVATE": broken}'),new Response(new ReadableStream({pull(){throw Error('PRIVATE transport');}}))]){
    await assert.rejects(readBoundedJson(response,{maxBytes:64}),error=>error instanceof SyntaxError&&safe(error));
    assert.equal(response.body.locked,false);
  }
});

test('already canceled JSON reads leave the body unread and unlocked',async()=>{
  const controller=new AbortController();controller.abort();
  const fixture=streamed('{"a":1}');
  await assert.rejects(readBoundedJson(fixture.response,{maxBytes:7,signal:controller.signal}),{name:'AbortError'});
  assert.equal(fixture.state.read,0);assert.equal(fixture.state.canceled,true);assert.equal(fixture.response.body.locked,false);
});

test('JSON cancellation does not wait for stalled upstream cleanup',async()=>{
  const controller=new AbortController();let entered;
  const reading=new Promise(resolve=>{entered=resolve;});
  const response=new Response(new ReadableStream({pull(){entered();return new Promise(()=>{});},cancel(){return new Promise(()=>{});}},{highWaterMark:0}));
  const pending=readBoundedJson(response,{maxBytes:7,signal:controller.signal});
  const rejected=assert.rejects(pending,{name:'AbortError'});await reading;controller.abort();await rejected;
  assert.equal(response.body.locked,false);
});

for(const provider of Object.keys(envelopes)){
  for(const declared of [false,true])test(`${provider} rejects an oversized ${declared?'declared':'chunked'} JSON success envelope`,async()=>{
    const fixture=streamed(JSON.stringify({...envelopes[provider],padding:'PRIVATE'.repeat(160000)}),{declared});
    await assert.rejects(invoke(provider,fixture.response),error=>error.code==='invalid_json'&&error.failureStage==='response_json'&&safe(error));
    assert.equal(fixture.state.canceled,true);
    assert.ok(fixture.state.read<1120000,'the rest of the oversized envelope must not be read');
    if(declared)assert.equal(fixture.state.read,0);
  });
  test(`${provider} rejects malformed UTF-8 in an otherwise valid JSON envelope`,async()=>{
    const json=JSON.stringify({...envelopes[provider],padding:'PRIVATE'}),bytes=new TextEncoder().encode(json);
    bytes[bytes.length-3]=0xff;
    await assert.rejects(invoke(provider,streamed(bytes).response),error=>error.code==='invalid_json'&&error.failureStage==='response_json'&&safe(error));
  });
  test(`${provider} keeps valid multibyte text split across single-byte chunks`,async()=>{
    assert.deepEqual(await invoke(provider,streamed(JSON.stringify(envelopes[provider]),{chunkBytes:1}).response),packet);
  });
}

for(const declared of [false,true]){
  test(`provider ${declared?'declared':'chunked'} error JSON is bounded without leaking its body`,async()=>{
    const fixture=streamed(JSON.stringify({error:{code:'rate_limit_exceeded',message:'PRIVATE'},padding:'x'.repeat(40000)}),{declared,status:429});
    await assert.rejects(invoke('groq',fixture.response),error=>error.code==='quota'&&safe(error));
    assert.equal(fixture.state.canceled,true);assert.ok(fixture.state.read<=20480);
    if(declared)assert.equal(fixture.state.read,0);
  });
  test(`speech ${declared?'declared':'chunked'} error JSON is bounded and falls back to its HTTP category`,async()=>{
    const fixture=streamed(JSON.stringify({error:{message:'Accept the terms. PRIVATE'},padding:'x'.repeat(40000)}),{declared,status:400});
    await assert.rejects(requestSpeech({text:'Hi.'},{provider:'groq',apiKey:'fixture',fetchImpl:async()=>fixture.response}),error=>error.code==='provider_http'&&safe(error));
    assert.equal(fixture.state.canceled,true);assert.ok(fixture.state.read<=20480);
  });
  test(`Redis ${declared?'declared':'chunked'} JSON cannot admit work after exceeding its response budget`,async()=>{
    let fixture;
    const allowance=createGuestAllowance({url:'https://fixture.invalid',token:'fixture',fetchImpl:async()=>{
      fixture=streamed(JSON.stringify({result:[1,1,0],padding:'PRIVATE'.repeat(3000)}),{declared});return fixture.response;
    }});
    const result=await allowance.take('network','text');
    assert.equal(result.allowed,false);assert.equal(result.code,'allowance_unavailable');
    assert.equal(result.usage.text.remaining,null);assert.equal(fixture.state.canceled,true);
    assert.ok(fixture.state.read<21000);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
  });
}

test('direct OpenAI HTTP failures cancel unread bodies without retaining them',async()=>{
  const fixture=streamed('PRIVATE'.repeat(3000),{status:429});
  await assert.rejects(invoke('openai',fixture.response),error=>error.code==='quota'&&safe(error));
  assert.equal(fixture.state.canceled,true);assert.equal(fixture.state.read,0);
});

test('Redis HTTP failures cancel unread bodies and remain unavailable',async()=>{
  const fixture=streamed('PRIVATE'.repeat(3000),{status:503});
  const allowance=createGuestAllowance({url:'https://fixture.invalid',token:'fixture',fetchImpl:async()=>fixture.response});
  assert.equal((await allowance.take('network','text')).code,'allowance_unavailable');
  assert.equal(fixture.state.canceled,true);assert.equal(fixture.state.read,0);
});

for(const kind of ['provider','speech'])test(`${kind} cancellation during error JSON stays cancellation`,async()=>{
  const controller=new AbortController(),reason=new DOMException('Canceled.','AbortError');
  const response=new Response(new ReadableStream({pull(source){source.error(new SyntaxError('PRIVATE'));controller.abort(reason);}},{highWaterMark:0}),{status:400});
  const pending=kind==='provider'?invoke('groq',response,controller.signal)
    :requestSpeech({text:'Hi.'},{provider:'groq',apiKey:'fixture',signal:controller.signal,fetchImpl:async()=>response});
  await assert.rejects(pending,error=>error===reason);
  assert.equal(response.body.locked,false);
});

for(const provider of ['groq','openai'])test(`${provider} abort cancels a pending JSON body read`,async()=>{
  const controller=new AbortController();let entered,source,canceled=false;
  const reading=new Promise(resolve=>{entered=resolve;});
  const body=new ReadableStream({start(value){source=value;},pull(){entered();return new Promise(()=>{});},cancel(){canceled=true;}},{highWaterMark:0});
  const pending=invoke(provider,new Response(body),controller.signal).then(()=>null,error=>error);
  await reading;controller.abort();
  let timer;const result=await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),250);})]);clearTimeout(timer);
  if(!result){source.error(new Error('Test cleanup'));await pending;}
  assert.equal(result?.name,'AbortError','cancellation must settle a blocked reader');assert.equal(canceled,true);
});
