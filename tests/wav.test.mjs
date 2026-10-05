import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSpeech, joinWav } from '../server/wav.mjs';
import { fixtureWav } from './helpers/wav.mjs';
test('speech splitting preserves all words and never exceeds Orpheus’s limit',()=>{
  const text='A shadow tries to become an actor but keeps missing its cue. '.repeat(7).trim();
  const chunks=splitSpeech(text);
  assert.ok(chunks.length>1);assert.ok(chunks.every(chunk=>chunk.length<=200));assert.equal(chunks.join(' '),text);
  const emoji=splitSpeech('😀'.repeat(105));assert.ok(emoji.every(chunk=>chunk.length<=200&&!/\uD83D$/.test(chunk)));assert.equal(emoji.join(''),'😀'.repeat(105));
});
test('WAV joining rewrites lengths and appends PCM samples rather than file headers',()=>{
  const joined=joinWav([fixtureWav([10,20]),fixtureWav([30,40])]);
  assert.equal(joined.readUInt32LE(4),joined.length-8);assert.equal(joined.readUInt32LE(40),8);
  assert.deepEqual([...Array(4)].map((_,i)=>joined.readInt16LE(44+i*2)),[10,20,30,40]);
});
test('WAV joining accepts streaming data lengths and rejects incompatible or malformed clips',()=>{
  const streamed=fixtureWav();streamed.writeUInt32LE(0xffffffff,4);streamed.writeUInt32LE(0xffffffff,40);
  assert.equal(joinWav([streamed,fixtureWav()]).readUInt32LE(40),8);
  assert.throws(()=>joinWav([fixtureWav(),fixtureWav([1],16000)]),/format/i);
  assert.throws(()=>joinWav([Buffer.from('not a wave')]),/WAV/i);
  const truncated=fixtureWav().subarray(0,45);assert.throws(()=>joinWav([truncated]),/WAV/i);
  assert.throws(()=>joinWav([fixtureWav(),fixtureWav()],48),/large/i);
});
