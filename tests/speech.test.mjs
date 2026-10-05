import test from 'node:test';
import assert from 'node:assert/strict';
import { requestSpeech } from '../server/speech.mjs';

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
