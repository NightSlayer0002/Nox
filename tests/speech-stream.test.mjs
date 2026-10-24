import test from 'node:test';
import assert from 'node:assert/strict';
import {readSpeechClips} from '../public/js/speech-stream.js';

const event=(index,text='audio')=>({index,type:'audio/wav',audio:Buffer.from(text).toString('base64')});
const line=value=>JSON.stringify(value)+'\n';
function speechResponse(text,{open=false}={}){
  let controller,cancelled=0;
  const body=new ReadableStream({start(value){controller=value;if(text)controller.enqueue(new TextEncoder().encode(text));if(!open)controller.close();},cancel(){cancelled++;}});
  return {response:new Response(body,{headers:{'content-type':'application/x-ndjson; charset=utf-8'}}),get cancelled(){return cancelled;},push:text=>controller.enqueue(new TextEncoder().encode(text))};
}
async function collect(response,options){const clips=[];for await(const clip of readSpeechClips(response,options))clips.push(clip);return clips;}

test('speech stream yields an ordered first clip before later data and releases the reader on done',async()=>{
  const stream=speechResponse(line(event(0,'first')),{open:true});
  const clips=readSpeechClips(stream.response);
  assert.equal(await (await clips.next()).value.blob.text(),'first');
  stream.push(line(event(1,'second'))+line({done:true}));
  assert.equal(await (await clips.next()).value.blob.text(),'second');
  assert.equal((await clips.next()).done,true);
  assert.equal(stream.cancelled,1);
  assert.equal(stream.response.body.locked,false);
});

test('speech stream accepts split JSON bytes and a terminal event without a final newline',async()=>{
  const stream=speechResponse('',{open:true}),clips=readSpeechClips(stream.response);
  stream.push(line(event(0)).slice(0,8));
  const first=clips.next();
  stream.push(line(event(0)).slice(8)+line({done:true}));
  assert.equal((await first).value.blob.type,'audio/wav');
  assert.equal((await clips.next()).done,true);
  assert.equal((await collect(speechResponse(line(event(0))+JSON.stringify({done:true})).response)).length,1);
});

test('speech stream rejects wrong content types, malformed events, noncanonical base64 and missing completion',async()=>{
  await assert.rejects(collect(new Response('{}',{headers:{'content-type':'application/json'}})),/invalid audio stream/i);
  for(const text of [
    'not json\n',line([]),line(null),line(event(1)),
    line(event(0))+line(event(0))+line({done:true}),
    line({...event(0),type:'text/html'})+line({done:true}),
    line({...event(0),audio:'a==='})+line({done:true}),
    line({...event(0),audio:'Zh=='})+line({done:true}),
    line({...event(0),audio:''})+line({done:true}),
    line({...event(0),audio:'Y Q=='})+line({done:true}),
    line(event(0)),line({done:true}),
    Array.from({length:5},(_,index)=>line(event(index))).join('')+line({done:true}),
  ])await assert.rejects(collect(speechResponse(text).response),/invalid audio stream/i);
});

test('speech stream bounds the encoded response and decoded audio across clips',async()=>{
  const oversizedAudio=Buffer.alloc(2*1024*1024+1).toString('base64');
  await assert.rejects(collect(speechResponse(line({...event(0),audio:oversizedAudio})+line({done:true})).response),/invalid audio stream/i);
  await assert.rejects(collect(speechResponse(' '.repeat(3*1024*1024+1)).response),/invalid audio stream/i);
});

test('speech stream sanitizes provider errors and cancels pending reads on abort',async()=>{
  const failed=speechResponse(line({error:'secret provider detail'}),{open:true});
  await assert.rejects(collect(failed.response),{message:'Natural voice could not respond.'});
  assert.equal(failed.cancelled,1);assert.equal(failed.response.body.locked,false);
  const controller=new AbortController(),stream=speechResponse(line(event(0)),{open:true}),clips=readSpeechClips(stream.response,{signal:controller.signal});
  await clips.next();
  const pending=clips.next();controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(stream.cancelled,1);assert.equal(stream.response.body.locked,false);
});

test('a stalled stream reader is bounded even when cancellation never resolves',async()=>{
  let cancelled=0,released=0;
  const response={headers:new Headers({'content-type':'application/x-ndjson'}),body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel(){cancelled++;return new Promise(()=>{});},releaseLock(){released++;}})}};
  await assert.rejects(collect(response,{timeoutMs:15}),/timed out/i);
  assert.ok(cancelled>=1);assert.equal(released,1);
});
