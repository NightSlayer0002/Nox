import test from 'node:test';
import assert from 'node:assert/strict';
import {requestSpeech,requestSpeechClips} from '../server/speech.mjs';
import {createCache} from '../server/cache.mjs';
import {fixtureWav} from './helpers/wav.mjs';
import {fixtureMpeg} from './helpers/mpeg.mjs';

const response=(audio,type)=>new Response(audio,{headers:{'content-type':type}});
const options=(audio,type,provider='groq')=>({provider,apiKey:'fixture',fetchImpl:async()=>response(audio,type)});
const input={text:'A format boundary.'};

for(const [provider,type,audio] of [['groq','audio/mpeg',fixtureMpeg()],['openai','audio/wav',fixtureWav()]])test(`${provider} rejects the other provider's audio MIME family before returning bytes`,async()=>{
  // Question: Can a valid but wrong-format response be mislabeled as success?
  // Limits: Injected transport only; no real provider or browser codec claim.
  await assert.rejects(requestSpeech(input,options(audio,type,provider)),error=>error.code==='invalid_audio_type');
});

for(const [name,make] of [
  ['non-WAV bytes',()=>Buffer.from('not-a-wav')],
  ['truncated RIFF header',()=>Buffer.from('RIFF')],
  ['truncated PCM chunk',()=>fixtureWav().subarray(0,45)],
  ['truncated declared RIFF size',()=>{const wav=fixtureWav();wav.writeUInt32LE(wav.length+100,4);return wav;}],
  ['empty PCM',()=>fixtureWav([])],
  ['zero-channel PCM',()=>{const wav=fixtureWav();wav.writeUInt16LE(0,22);return wav;}],
  ['inconsistent PCM byte rate',()=>{const wav=fixtureWav();wav.writeUInt32LE(1,28);return wav;}],
])test(`Groq rejects ${name} before a single clip can be emitted`,async()=>{
  // Question: Does the single-clip path validate this malformed WAV boundary?
  // Limits: Container structure/PCM presence; no audible quality or decode claim.
  const clips=requestSpeechClips(input,options(make(),'audio/wav'));
  await assert.rejects(clips.next(),error=>error.code==='invalid_audio_data'&&/WAV/.test(error.message));
});

for(const type of ['audio/wav','audio/wave','audio/x-wav','audio/vnd.wave','Audio/WAV; codecs=1'])test(`Groq retains valid WAV bytes for MIME variant ${type}`,async()=>{
  // Question: Does format validation preserve this legitimate MIME spelling?
  // Limits: Synthetic PCM envelope; no provider conformance/device decoding claim.
  const wav=fixtureWav([101,-202]);assert.deepEqual(await requestSpeech(input,options(wav,type)),wav);
});

test('WAV validation preserves streaming sentinels and padded metadata without rewriting the provider bytes',async()=>{
  // Question: Does validation retain supported stream-size and metadata variants?
  // Limits: Hand-built RIFF structures; not exhaustive WAV format compatibility.
  const streamed=fixtureWav([17]);streamed.writeUInt32LE(0xffffffff,4);streamed.writeUInt32LE(0xffffffff,40);
  assert.deepEqual(await requestSpeech(input,options(streamed,'audio/wav')),streamed);
  const tagged=Buffer.concat([fixtureWav([23]),Buffer.from([0x4a,0x55,0x4e,0x4b,3,0,0,0,97,98,99,0])]);tagged.writeUInt32LE(tagged.length-8,4);
  assert.deepEqual(await requestSpeech(input,options(tagged,'audio/x-wav')),tagged);
});

test('WAV transport retains a supported floating-point frame format without rewriting it',async()=>{
  // Question: Does the validation wrapper preserve the parser's float WAV path?
  // Limits: One valid mono float envelope; not exhaustive WAV/decode compatibility.
  const wav=fixtureWav([0,0]);wav.writeUInt16LE(3,20);wav.writeUInt16LE(4,32);wav.writeUInt16LE(32,34);wav.writeUInt32LE(96000,28);wav.writeFloatLE(.25,44);
  assert.deepEqual(await requestSpeech(input,options(wav,'audio/wav')),wav);
});

test('a malformed later progressive WAV is neither emitted nor cached while a valid clip remains reusable',async()=>{
  // Question: Does per-clip validation protect both progressive output and cache?
  // Limits: Deterministic two-clip/cache ordering; no HTTP framing or live service claim.
  let requests=0;const clipCache=createCache(),settings={provider:'groq',apiKey:'fixture',clipCache,fetchImpl:async()=>{requests++;return response(requests===2?Buffer.from('bad wave'):fixtureWav([requests===1?101:202]),'audio/wav');}};
  const text={text:'word '.repeat(50).trim()},clips=requestSpeechClips(text,settings);
  assert.equal((await clips.next()).value.readInt16LE(44),101);await assert.rejects(clips.next(),error=>error.code==='invalid_audio_data');
  const combined=await requestSpeech(text,settings);assert.equal(requests,3);assert.equal(combined.readInt16LE(44),101);assert.equal(combined.readInt16LE(46),202);
});

for(const type of ['audio/mpeg','audio/mp3','audio/x-mp3','audio/mpeg3','audio/x-mpeg3','Audio/MPEG; codecs=mp3'])test(`OpenAI accepts recognizable MPEG envelopes for MIME variant ${type}`,async()=>{
  // Question: Can supported MPEG MIME variants pass a bounded header guard?
  // Limits: Header/ID3 structure only; frame decodability and audible quality unproven.
  for(const variant of [{},{tag:true},{tag:true,footer:true}]){const audio=fixtureMpeg(variant);assert.deepEqual(await requestSpeech(input,options(audio,type,'openai')),audio);}
});

for(const [name,make] of [
  ['arbitrary bytes',()=>Buffer.from('not MPEG audio')],
  ['truncated ID3 header',()=>Buffer.from('ID3')],
  ['tag without an audio frame',()=>fixtureMpeg({tag:true}).subarray(0,14)],
  ['truncated declared ID3 tag',()=>{const audio=fixtureMpeg({tag:true});audio[9]=0x7f;audio[8]=0x7f;return audio;}],
  ['reserved MPEG header',()=>Buffer.from([0xff,0xfb,0xfc,0,0])],
])test(`OpenAI rejects ${name} despite an MPEG MIME label`,async()=>{
  // Question: Does a MIME label alone bypass the minimal MPEG/ID3 structure guard?
  // Limits: Obvious incompatible/truncated headers only; this is not an MPEG decoder.
  await assert.rejects(requestSpeech(input,options(make(),'audio/mpeg','openai')),error=>error.code==='invalid_audio_data'&&/MPEG/.test(error.message));
});
