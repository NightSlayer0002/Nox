import test from 'node:test';
import assert from 'node:assert/strict';
import {playReplyPreview} from '../public/js/reply.js';
test('turning voice on and replay share a bounded preview without changing the full packet',()=>{
  const packet={speech:'A complete opening sentence. '+ 'A much longer answer follows. '.repeat(100),emotion:'curious',action:'gravity',memory:''},spoken=[];
  const stage={speak:packet=>spoken.push(['stage',packet])},voice={speak:(text,mode,emotion)=>spoken.push(['voice',text,mode,emotion])};
  const original=structuredClone(packet);playReplyPreview(packet,{stage,voice,mode:'companion'});
  assert.ok(spoken[0][1].speech.length<=420);assert.equal(spoken[0][1].action,'none');
  assert.equal(spoken[1][1],spoken[0][1].speech);assert.equal(spoken[1][2],'companion');assert.equal(spoken[1][3],'curious');assert.deepEqual(packet,original);
});
