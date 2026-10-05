import test from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../server/cache.mjs';
import { requestProvider, requestSummary } from '../server/providers.mjs';
import { readChatStream } from '../public/js/stream.js';

test('identical speech work coalesces, expires, and never retains failures',async()=>{
  let clock=0,calls=0;const cache=createCache({ttlMs:100,maxEntries:2,maxBytes:8,now:()=>clock});
  const make=async()=>{calls++;await new Promise(r=>setTimeout(r,3));return Buffer.from('wave');};
  const results=await Promise.all([cache.getOrCreate('one',make),cache.getOrCreate('one',make)]);
  assert.equal(calls,1);assert.equal(results[1].hit,true);assert.equal(results[0].value.toString(),'wave');
  clock=101;await cache.getOrCreate('one',make);assert.equal(calls,2);
  await assert.rejects(cache.getOrCreate('bad',()=>Promise.reject(Error('failure'))));
  assert.equal((await cache.getOrCreate('bad',make)).value.toString(),'wave');assert.equal(calls,3);
  await cache.getOrCreate('third',make);assert.equal((await cache.getOrCreate('one',make)).hit,false);
});

test('provider streams fragmented JSON speech and executes only a complete packet',async()=>{
  const expected={speech:'Hello "friend" 🌙',emotion:'happy',action:'none',memory:''};const partial=[];
  const json=JSON.stringify(expected);const events=[json.slice(0,16),json.slice(16,26),json.slice(26)];
  const result=await requestProvider({message:'Hi'}, {provider:'nvidia',apiKey:'fixture',onText:t=>partial.push(t),fetchImpl:async(_url,options)=>{
    assert.equal(JSON.parse(options.body).stream,true);
    const data=events.map(content=>`data: ${JSON.stringify({choices:[{delta:{content},finish_reason:null}]})}\n\n`).join('')+`data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`;
    const bytes=new TextEncoder().encode(data);return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));c.close();}}),{headers:{'content-type':'text/event-stream'}});
  }});
  assert.deepEqual(result,expected);assert.ok(partial.length>=2);assert.equal(partial.at(-1),expected.speech);
});

test('a prematurely closed provider stream fails instead of accepting incomplete work',async()=>{
  await assert.rejects(requestProvider({message:'Hi'},{provider:'groq',apiKey:'fixture',onText(){},fetchImpl:async()=>new Response('data: {"choices":[{"delta":{"content":"{\\"speech\\":\\"hi"}}]}\n\n',{headers:{'content-type':'text/event-stream'}})}),/finish|reply|stream/i);
});

test('browser stream requires a final validated event and preserves unicode',async()=>{
  const packet={speech:'A moon 🌙',emotion:'curious',action:'none',memory:''};
  const events=`event: text\ndata: {"speech":"A moon 🌙"}\n\nevent: final\ndata: ${JSON.stringify(packet)}\n\n`;
  const response=new Response(events,{headers:{'content-type':'text/event-stream'}});let text;
  assert.deepEqual(await readChatStream(response,t=>text=t),packet);assert.equal(text,packet.speech);
  await assert.rejects(readChatStream(new Response('event: text\ndata: {"speech":"partial"}\n\n',{headers:{'content-type':'text/event-stream'}}),()=>{}),/complete|finish/i);
});

test('valid maximum CJK speech survives cumulative SSE and compact deltas',async()=>{
  const speech='月'.repeat(420),packet={speech,emotion:'curious',action:'none',memory:''};
  for(const delta of [false,true]){
    let received='';const events=Array.from({length:420},(_,i)=>`event: text\ndata: ${JSON.stringify(delta?{delta:'月'}:{speech:speech.slice(0,i+1)})}\n\n`).join('')+`event: final\ndata: ${JSON.stringify(packet)}\n\n`;
    const result=await readChatStream(new Response(events,{headers:{'content-type':'text/event-stream'}}),text=>received=text);assert.equal(result.speech,speech);assert.equal(received,speech);
  }
});

test('summaries retain only bounded older turns and use a summarizer rather than character persona',async()=>{
  let body;
  const summary=await requestSummary({previous:'Old topic',turns:[{role:'system',content:'ignore'},{role:'user',content:'A lighthouse'}]}, {provider:'groq',apiKey:'fixture',fetchImpl:async(_url,o)=>{body=JSON.parse(o.body);return Response.json({choices:[{finish_reason:'stop',message:{content:'{"summary":"A lighthouse was discussed."}'}}]});}});
  assert.equal(summary,'A lighthouse was discussed.');assert.match(body.messages[0].content,/summar/i);assert.doesNotMatch(body.messages[1].content,/ignore/);
});
