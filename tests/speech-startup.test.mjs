import test from 'node:test';
import assert from 'node:assert/strict';
import {startupSpeechChunks,splitSpeech} from '../server/wav.mjs';
test('speech uses the shortest useful first clip without adding provider requests',()=>{
  for(const length of [249,364,420]){
    const text='word '.repeat(90).slice(0,length).trim(),original=splitSpeech(text,180),chunks=startupSpeechChunks(text,180);
    assert.equal(chunks.length,original.length);assert.ok(chunks[0].length<original[0].length);assert.ok(chunks.every(value=>value.length<=180));assert.equal(chunks.join(' '),original.join(' '));
  }
});
test('short replies and unbroken text keep their original synthesis plan',()=>{
  for(const text of ['A short reply.','月'.repeat(410),'x'.repeat(199)])assert.deepEqual(startupSpeechChunks(text,180),splitSpeech(text,180));
});
