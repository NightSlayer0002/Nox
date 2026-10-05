import test from 'node:test';
import assert from 'node:assert/strict';
import { requestSpeech } from '../server/speech.mjs';
import { fixtureWav } from './helpers/wav.mjs';

test('natural speech sends bounded text with server-owned voice, model, and acting direction', async () => {
  let body;
  const audio = await requestSpeech({text:'Hello.',mode:'uncanny'}, {apiKey:'test',voice:'cedar',fetchImpl:async (url,options) => {
    assert.equal(url,'https://api.openai.com/v1/audio/speech'); body=JSON.parse(options.body);
    return new Response(new Uint8Array([73,68,51]),{headers:{'content-type':'audio/mpeg'}});
  }});
  assert.equal(body.model,'gpt-4o-mini-tts'); assert.equal(body.voice,'cedar'); assert.equal(body.input,'Hello.');
  assert.match(body.instructions,/quiet|subtle/i); assert.equal(audio.length,3);
  await assert.rejects(() => requestSpeech({text:'x'.repeat(421)}, {apiKey:'test'}),/420/);
});

test('speech rejects provider failures and an oversized audio stream', async () => {
  await assert.rejects(() => requestSpeech({text:'Hi'}, {apiKey:'test',fetchImpl:async () => new Response('{}',{status:429})}),/provider/i);
  await assert.rejects(() => requestSpeech({text:'Hi'}, {apiKey:'test',fetchImpl:async () => new Response(new Uint8Array(2*1024*1024+1),{headers:{'content-type':'audio/mpeg'}})}),/large/i);
});

test('Groq natural voice uses the Orpheus model and WAV with an allowed voice',async()=>{
  await requestSpeech({text:'Hi.'},{provider:'groq',apiKey:'test',voice:'injected',fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.groq.com/openai/v1/audio/speech');
    const body=JSON.parse(options.body);assert.equal(body.model,'canopylabs/orpheus-v1-english');assert.equal(body.voice,'troy');assert.equal(body.response_format,'wav');
    return new Response(new Uint8Array([82,73,70,70]),{headers:{'content-type':'audio/wav'}});
  }});
});

test('speech diagnostics classify provider failures without retaining secret error bodies',async()=>{
  await assert.rejects(requestSpeech({text:'Hi.'},{provider:'groq',apiKey:'test',fetchImpl:async()=>Response.json({error:{message:'Accept the model terms first. private-secret',code:'model_terms_required'}},{status:400})}),error=>{
    assert.equal(error.providerStatus,400);assert.equal(error.code,'terms_required');assert.doesNotMatch(error.message,/private-secret/);return true;
  });
  await assert.rejects(requestSpeech({text:'Hi.'},{provider:'groq',apiKey:'test',fetchImpl:async()=>new Response('not audio',{headers:{'content-type':'application/octet-stream'}})}),error=>{
    assert.equal(error.code,'invalid_audio_type');return true;
  });
});

test('a long Groq reply sends bounded parallel parts and returns one ordered WAV',async()=>{
  const calls=[];
  const audio=await requestSpeech({text:'word '.repeat(50).trim()},{provider:'groq',apiKey:'test',voice:'troy',fetchImpl:async(url,options)=>{
    const body=JSON.parse(options.body);assert.ok(body.input.length<=200);calls.push({body,signal:options.signal});
    const index=calls.length;await new Promise(resolve=>setTimeout(resolve,index===1?20:1));
    return new Response(fixtureWav([index,index]),{headers:{'content-type':'audio/wav'}});
  }});
  assert.equal(calls.length,2);assert.equal(calls.map(call=>call.body.input).join(' '),'word '.repeat(50).trim());
  assert.equal(calls[0].signal,calls[1].signal);
  assert.deepEqual([...Array(4)].map((_,i)=>audio.readInt16LE(44+i*2)),[1,1,2,2]);
});
