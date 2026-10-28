import test from 'node:test';
import assert from 'node:assert/strict';
import {requestNox} from '../server/ai.mjs';

const packet={speech:'A complete reply.',emotion:'curious',action:'none',memory:''};
const output=text=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text}]}]});
const invoke=(fetchImpl,signal)=>requestNox({message:'A fictional probe.'},{apiKey:'PRIVATE key',fetchImpl,signal});
function safe(error){assert.doesNotMatch(`${error.stack}\n${JSON.stringify(error)}`,/PRIVATE/);}

for(const [status,code] of [[401,'credentials'],[403,'credentials'],[429,'quota'],[503,'provider_http']])test(`OpenAI HTTP ${status} retains only its safe category and status`,async()=>{
  // Question: Does this HTTP failure reach the common diagnostic contract?
  // Limits: Synthetic response; no credentials, quota, or provider availability proof.
  await assert.rejects(invoke(async()=>Response.json({error:{message:'PRIVATE body',code:'PRIVATE unknown code'}},{status})),error=>{
    assert.equal(error.code,code);assert.equal(error.providerStatus,status);safe(error);return true;
  });
});

test('OpenAI max-output incompletion retains output_limit without returning its partial packet',async()=>{
  // Question: Is a token-limited incomplete response distinct from other failures?
  // Limits: Known response fixture; does not measure current model output quality.
  await assert.rejects(invoke(async()=>Response.json({...output(JSON.stringify(packet)),status:'incomplete',incomplete_details:{reason:'max_output_tokens',detail:'PRIVATE'}})),error=>{
    assert.equal(error.code,'output_limit');assert.equal(error.providerStatus,200);safe(error);return true;
  });
});

for(const status of ['incomplete','failed'])test(`OpenAI ${status} with another cause remains a safe finish failure`,async()=>{
  // Question: Can an unfinished response be rejected without retaining its cause text?
  // Limits: Controlled status envelope; no exhaustive future provider-reason coverage.
  await assert.rejects(invoke(async()=>Response.json({...output(JSON.stringify(packet)),status,incomplete_details:{reason:'PRIVATE cause'},error:{message:'PRIVATE failure'}})),error=>{
    assert.equal(error.code,'finish_reason');assert.equal(error.providerStatus,200);safe(error);return true;
  });
});

test('OpenAI refusal rejects even when the envelope also contains otherwise valid output text',async()=>{
  // Question: Can refusal content be mistaken for a successful partial answer?
  // Limits: Synthetic mixed content; no evaluation of the provider's refusal policy.
  const envelope=output(JSON.stringify(packet));envelope.output[0].content.push({type:'refusal',refusal:'PRIVATE refusal text'});
  await assert.rejects(invoke(async()=>Response.json(envelope)),error=>{
    assert.equal(error.code,'finish_reason');assert.equal(error.providerStatus,200);safe(error);return true;
  });
});

for(const [stage,response] of [
  ['response_json',()=>new Response('PRIVATE malformed envelope')],
  ['packet_json',()=>Response.json(output('PRIVATE malformed packet'))],
  ['packet_schema',()=>Response.json(output(JSON.stringify({speech:'',detail:'PRIVATE invalid packet'})))],
])test(`OpenAI ${stage} errors identify their stage without exposing payloads`,async()=>{
  // Question: Does this parse/validation failure retain a safe category and stage?
  // Limits: One malformed fixture per boundary; not a wire-size or fuzzing claim.
  await assert.rejects(invoke(async()=>response()),error=>{
    assert.equal(error.code,'invalid_json');assert.equal(error.failureStage,stage);assert.equal(error.providerStatus,200);safe(error);return true;
  });
});

test('an already-aborted OpenAI call never enters its provider transport',async()=>{
  // Question: Does cancellation win before a transport that might ignore its signal?
  // Limits: Local call boundary; no HTTP disconnect or provider billing evidence.
  const controller=new AbortController(),reason=new DOMException('Canceled.','AbortError');controller.abort(reason);let calls=0;
  await assert.rejects(invoke(async()=>{calls++;return Response.json(output(JSON.stringify(packet)));},controller.signal),error=>error===reason);
  assert.equal(calls,0);
});

test('OpenAI transport aborts retain their original error identity',async()=>{
  // Question: Does classification preserve a transport abort rather than wrapping it?
  // Limits: Injected rejection; native fetch timing and network behavior are untested.
  const reason=new DOMException('Canceled.','AbortError');
  await assert.rejects(invoke(async()=>{throw reason;}),error=>error===reason);
});

test('OpenAI cancellation during body parsing wins over a parser failure',async()=>{
  // Question: Can a body-read abort be mislabeled as malformed JSON or leak text?
  // Limits: Controlled parser race; no real socket/body-reader integration claim.
  const controller=new AbortController(),reason=new DOMException('Canceled.','AbortError');
  await assert.rejects(invoke(async()=>({ok:true,status:200,json:async()=>{controller.abort(reason);throw new SyntaxError('PRIVATE parser error');}}),controller.signal),error=>error===reason);
});

test('OpenAI cancellation before a late HTTP response wins over HTTP classification',async()=>{
  // Question: Does an abort remain cancellation when transport returns a late failure?
  // Limits: Injected response that ignores abort; no upstream cancellation guarantee.
  const controller=new AbortController(),reason=new DOMException('Canceled.','AbortError');
  await assert.rejects(invoke(async()=>{controller.abort(reason);return Response.json({error:{message:'PRIVATE'}},{status:401});},controller.signal),error=>error===reason);
});
