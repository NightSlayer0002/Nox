import test from 'node:test';
import assert from 'node:assert/strict';
import { wavEnvelope, envelopeAt, speechTimeline, timelineAt, speechChunks } from '../public/js/speech-envelope.js';

test('the mouth follows audible PCM and closes in an actual audio gap',()=>{
  const data=new ArrayBuffer(44+1600*2),v=new DataView(data);
  const str=(offset,text)=>[...text].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
  str(0,'RIFF');v.setUint32(4,data.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,3200,true);
  for(let i=0;i<1600;i++)v.setInt16(44+i*2,i<400||i>=1200?(i%2?6000:-6000):0,true);
  const envelope=wavEnvelope(data);assert.ok(envelopeAt(envelope,.02)>.4);assert.equal(envelopeAt(envelope,.1),0);assert.ok(envelopeAt(envelope,.18)>.4);assert.equal(envelopeAt(envelope,2),0);
  assert.equal(wavEnvelope(new ArrayBuffer(5)),null);
});

test('estimated browser speech reserves punctuation gaps and retains every sentence',()=>{
  const chunks=speechChunks('Oh. You found me!');assert.deepEqual(chunks,['Oh.','You found me!']);
  const timeline=speechTimeline('Hello. Next');
  assert.ok(timelineAt(timeline,.08)>0);assert.equal(timelineAt(timeline,.4),0);
  assert.equal(timelineAt(timeline,100),0);
});
