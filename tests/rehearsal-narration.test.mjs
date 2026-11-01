import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNarration,createLineNarration} from '../public/js/rehearsal-narration.js';
import {startupSpeechChunks} from '../server/wav.mjs';

// Question: does the largest allowed walkthrough stay within four Orpheus synthesis requests?
// Limits: bounds input volume only; account quota may already be consumed by other users.
test('four maximum-size explanations each fit a single 200-character synthesis request',()=>{
  const text=Array.from({length:4},(_,i)=>`[L${1997+i}] ${'x'.repeat(160)}`).join('\n');
  const segments=parseNarration(text,{startLine:1997,endLine:2000});
  assert.equal(segments.flatMap(segment=>startupSpeechChunks(segment.text,200)).length,4);
  assert.ok(segments.every(segment=>segment.text.length<=200));
});

// Question: can malformed, skipped, duplicated or oversized narration silently highlight unrelated code?
// Limits: alignment validation cannot establish that an explanation is factually correct.
test('narration requires exactly one bounded explanation for every selected line in order',()=>{
  const context={startLine:3,endLine:4};
  assert.deepEqual(parseNarration('[L3] Assign the price.\n[L4] Return it.',context).map(v=>v.line),[3,4]);
  for(const speech of ['[L3] Assign it.','[L4] Return.\n[L3] Assign.','[L3] Assign.\n[L3] Again.','[L3] '+ 'x'.repeat(161)+'\n[L4] Return.'])assert.throws(()=>parseNarration(speech,context));
  assert.throws(()=>parseNarration('[L1] x',{startLine:1,endLine:5}),/four/i);
});

// Question: does highlighting track actual playback starts, with no speculative next synthesis?
// Limits: injected lifecycle events; physical speakers, latency and audio quality need separate acceptance.
test('narration advances only at audio boundaries and stops without spending the next request',async()=>{
  const calls=[],highlights=[],states=[];
  const voice={speak:(text,options)=>{calls.push({text,options});},stop:()=>{}};
  const run=createLineNarration({voice,onLine:line=>highlights.push(line),onState:state=>states.push(state)});
  const segments=parseNarration('[L1] Declare it.\n[L2] Return it.',{startLine:1,endLine:2});run.start(segments);
  assert.equal(calls.length,1);assert.deepEqual(highlights,[null]);
  calls[0].options.onPlaybackStart();assert.equal(highlights.at(-1),1);
  calls[0].options.onPlaybackEnd();await Promise.resolve();assert.equal(calls.length,2);
  run.stop();calls[1].options.onPlaybackStart();assert.equal(highlights.at(-1),null);assert.equal(states.at(-1),'stopped');
});

// Question: can early or late audio failure erase text or automatically spend another request?
// Limits: playback orchestration only; text persistence is covered in conversation tests.
test('audio unavailability ends the sequence without retry or later speech',()=>{
  let options,count=0;const states=[];
  const run=createLineNarration({voice:{speak:(_,value)=>{count++;options=value;},stop:()=>{}},onState:state=>states.push(state)});
  run.start(parseNarration('[L1] First.\n[L2] Second.',{startLine:1,endLine:2}));
  options.onPlaybackUnavailable({message:'Quota reached'});assert.equal(count,1);assert.equal(states.at(-1),'error');
});
