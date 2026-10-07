import test from 'node:test';
import assert from 'node:assert/strict';
import { spokenPreview } from '../public/js/reply.js';
import { readChatStream } from '../public/js/stream.js';
test('speech preview finishes at a sentence without losing the written reply',()=>{
  const text='A useful answer. '+ 'A much longer explanation follows. '.repeat(80);
  const spoken=spokenPreview(text);
  assert.ok(spoken.length<=420);assert.ok(spoken.endsWith('.'));assert.ok(text.length>spoken.length);
  assert.equal(spokenPreview('Hi.\nNice to meet you.'),'Hi. Nice to meet you.');
});
test('client stream preserves a deep reply beyond the old character cap',async()=>{
  const speech='Detailed thought. '.repeat(200),packet={speech,emotion:'curious',action:'none',memory:''};let shown='';
  const response=new Response(`event: text\ndata: ${JSON.stringify({speech})}\n\nevent: final\ndata: ${JSON.stringify(packet)}\n\n`,{headers:{'content-type':'text/event-stream'}});
  const result=await readChatStream(response,text=>shown=text);assert.equal(shown,speech);assert.equal(result.speech,speech);
});
