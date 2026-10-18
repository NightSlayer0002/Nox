import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createAppServer} from '../server.mjs';
import {requestSpeechClips} from '../server/speech.mjs';
import {fixtureWav} from './helpers/wav.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
async function withServer(options,run) {
  const server=createAppServer({hosted:true,publicHosts:['nox.example'],accessToken:'owner-fixture',providers:[],apiKey:'',naturalVoice:true,speechProvider:'groq',speechKey:'voice-fixture',speech:async()=>{throw Error('Unexpected legacy speech fixture.');},...options});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {await run(`http://127.0.0.1:${server.address().port}`);}
  finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
function open(base,body,headers={}) {
  const result=deferred();
  const request=http.request(`${base}/api/speech`,{method:'POST',headers:{host:'nox.example',origin:'https://nox.example','content-type':'application/json',...headers}},result.resolve);
  request.on('error',result.reject);request.end(JSON.stringify(body));
  return {request,response:result.promise};
}
async function collect(response) {
  const chunks=[];for await(const chunk of response)chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}
async function* records(response) {
  let pending='';
  for await(const chunk of response) {
    pending+=chunk.toString();let end;
    while((end=pending.indexOf('\n'))>=0){yield JSON.parse(pending.slice(0,end));pending=pending.slice(end+1);}
  }
  assert.equal(pending,'');
}

test('speech HTTP streams the first clip before later synthesis finishes and ends with one done record',async()=>{
  const later=deferred();let calls=0,legacyCalls=0;
  await withServer({speech:async()=>{legacyCalls++;return Buffer.from('legacy');},speechClips:async function*(input,options){
    calls++;assert.equal(input.emotion,'curious');assert.equal(options.voice,'troy');assert.equal(options.provider,'groq');
    yield Buffer.from('first');await later.promise;yield Buffer.from('second');
  }},async base=>{
    const response=await open(base,{text:'A complete reply.',emotion:'curious',voice:'not-allowed',stream:true}).response;
    assert.equal(response.statusCode,200);assert.match(response.headers['content-type'],/^application\/x-ndjson/);
    const stream=records(response);
    assert.deepEqual((await stream.next()).value,{index:0,audio:'Zmlyc3Q=',type:'audio/wav'});
    assert.equal(calls,1);assert.equal(legacyCalls,0);
    later.resolve();
    assert.deepEqual((await stream.next()).value,{index:1,audio:'c2Vjb25k',type:'audio/wav'});
    assert.deepEqual((await stream.next()).value,{done:true});
    assert.equal((await stream.next()).done,true);
  });
});

test('streamed requests charge public quota once and validate inputs before spending it',async()=>{
  let calls=0;
  await withServer({speechClips:async function*(){calls++;for(let i=0;i<4;i++)yield Buffer.from([i]);}},async base=>{
    const invalid=await open(base,{text:'x'.repeat(421),stream:true}).response;assert.equal(invalid.statusCode,400);await collect(invalid);
    const foreign=await open(base,{text:'Foreign',stream:true},{origin:'https://foreign.example'}).response;assert.equal(foreign.statusCode,403);await collect(foreign);
    for(let i=0;i<4;i++) {
      const response=await open(base,{text:`Public ${i}`,stream:true}).response;
      assert.equal(response.statusCode,200);
      const received=[];for await(const record of records(response))received.push(record);
      assert.equal(received.length,5);assert.deepEqual(received.at(-1),{done:true});
    }
    const limited=await open(base,{text:'One too many',stream:true}).response;
    assert.equal(limited.statusCode,429);assert.ok(Number(limited.headers['retry-after'])>0);await collect(limited);
    assert.equal(calls,4);
  });
});

test('multi-clip owner streams consume one shared request allowance per HTTP request',async()=>{
  let calls=0;
  await withServer({speechClips:async function*(){calls++;for(let i=0;i<4;i++)yield Buffer.from([i]);}},async base=>{
    for(let i=0;i<30;i++) {
      const response=await open(base,{text:`Owner ${i}`,stream:true},{authorization:'Bearer owner-fixture'}).response;
      assert.equal(response.statusCode,200);await collect(response);
    }
    const limited=await open(base,{text:'One too many',stream:true},{authorization:'Bearer owner-fixture'}).response;
    assert.equal(limited.statusCode,429);await collect(limited);assert.equal(calls,30);
  });
});

test('streamed clip caches separate owner access and individual temporary guest visits',async()=>{
  let calls=0;
  const scopes=[];
  const fetchImpl=async()=>{calls++;return new Response(fixtureWav([101]),{headers:{'content-type':'audio/wav'}});};
  await withServer({speechClips:(input,options)=>{scopes.push(options.cacheScope);return requestSpeechClips(input,{...options,fetchImpl});}},async base=>{
    const guestA={'x-nox-guest':'1','x-nox-visit-id':'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},guestB={...guestA,'x-nox-visit-id':'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'};
    for(const headers of [{authorization:'Bearer owner-fixture'},guestA,guestA,guestB]) {
      const response=await open(base,{text:'A private phrase.',stream:true},headers).response;
      assert.equal(response.statusCode,200);await collect(response);
    }
    assert.equal(calls,3);assert.equal(new Set(scopes).size,3);
  });
});

test('backpressure pauses pulling later clips until the previous record can drain',async()=>{
  const originalWrite=http.ServerResponse.prototype.write;let blocked,produced=0;
  http.ServerResponse.prototype.write=function(...args){
    const result=originalWrite.apply(this,args);
    if(!blocked&&this.getHeader('content-type')?.startsWith('application/x-ndjson')&&String(args[0]).includes('"index":0')){blocked=this;return false;}
    return result;
  };
  try {
    await withServer({speechClips:async function*(){produced++;yield Buffer.from('first');produced++;yield Buffer.from('second');}},async base=>{
      const response=await open(base,{text:'Pause at the write boundary.',stream:true}).response,stream=records(response);
      assert.equal((await stream.next()).value.index,0);assert.equal(produced,1);
      blocked.emit('drain');
      assert.equal((await stream.next()).value.index,1);assert.deepEqual((await stream.next()).value,{done:true});assert.equal((await stream.next()).done,true);
    });
  } finally {http.ServerResponse.prototype.write=originalWrite;}
});

test('paid streamed speech keeps owner access and injected legacy fixtures never call a real provider',async()=>{
  let calls=0;
  await withServer({speechProvider:'openai',apiKey:'text-fixture',speech:async()=>{calls++;return Buffer.from('fixture-audio');}},async base=>{
    const locked=await open(base,{text:'Hi',stream:true}).response;assert.equal(locked.statusCode,401);await collect(locked);
    const response=await open(base,{text:'Hi',stream:true},{authorization:'Bearer owner-fixture'}).response;
    assert.equal(response.statusCode,200);
    const received=[];for await(const record of records(response))received.push(record);
    assert.deepEqual(received,[{index:0,audio:Buffer.from('fixture-audio').toString('base64'),type:'audio/mpeg'},{done:true}]);
    assert.equal(calls,1);
    const legacy=await open(base,{text:'Legacy'},{authorization:'Bearer owner-fixture'}).response;
    assert.match(legacy.headers['content-type'],/^audio\/mpeg/);assert.equal(await collect(legacy),'fixture-audio');assert.equal(calls,2);
  });
});

test('speech failures before the first clip stay HTTP errors and later failures use safe stream errors',async()=>{
  for(const first of [false,true]) {
    await withServer({speechClips:async function*(){if(first)yield Buffer.from('first');throw Error('PRIVATE upstream failure and key');}},async base=>{
      const response=await open(base,{text:'A failing reply.',stream:true}).response;
      assert.equal(response.statusCode,first?200:502);
      const text=await collect(response);assert.doesNotMatch(text,/PRIVATE|upstream|key/);
      if(first) {
        const received=text.trim().split('\n').map(JSON.parse);
        assert.equal(received.length,2);assert.equal(received[0].index,0);assert.equal(typeof received[1].error,'string');assert.equal(received[1].done,undefined);
      } else {assert.match(response.headers['content-type'],/^application\/json/);assert.equal(typeof JSON.parse(text).error,'string');}
    });
  }
});

test('speech HTTP bounds streamed audio bytes and clip count before writing invalid records',async()=>{
  for(const fixture of [async function*(){yield Buffer.alloc(2*1024*1024+1);},async function*(){for(let i=0;i<5;i++)yield Buffer.from([i]);},async function*(){yield Buffer.alloc(1200000);yield Buffer.alloc(1200000);}]) {
    await withServer({speechClips:fixture},async base=>{
      const response=await open(base,{text:'Bounded reply.',stream:true}).response;
      const text=await collect(response);
      if(response.statusCode===502){assert.equal(typeof JSON.parse(text).error,'string');return;}
      assert.equal(response.statusCode,200);
      const received=text.trim().split('\n').map(JSON.parse),audio=received.filter(record=>record.audio);
      assert.ok(audio.length<=4);assert.ok(audio.reduce((size,record)=>size+Buffer.from(record.audio,'base64').length,0)<=2*1024*1024);
      assert.equal(typeof received.at(-1).error,'string');assert.equal(received.at(-1).done,undefined);
    });
  }
});

test('disconnecting one streamed caller leaves coalesced synthesis usable by another owner request',async()=>{
  const synthesis=deferred(),twoEntered=deferred(),firstAborted=deferred();let calls=0,entered=0,upstreamSignal;
  const fetchImpl=(_url,options)=>{calls++;upstreamSignal=options.signal;return synthesis.promise;};
  await withServer({speechClips:(input,options)=>{
    entered++;
    if(entered===1)options.signal.addEventListener('abort',firstAborted.resolve,{once:true});
    if(entered===2)twoEntered.resolve();
    return requestSpeechClips(input,{...options,fetchImpl});
  }},async base=>{
    const first=open(base,{text:'Shared reply.',stream:true},{authorization:'Bearer owner-fixture'});first.response.catch(()=>{});
    const second=open(base,{text:'Shared reply.',stream:true},{authorization:'Bearer owner-fixture'});
    await twoEntered.promise;assert.equal(calls,1);
    first.request.destroy();await firstAborted.promise;assert.equal(upstreamSignal.aborted,false);
    synthesis.resolve(new Response(fixtureWav([101]),{headers:{'content-type':'audio/wav'}}));
    const response=await second.response;assert.equal(response.statusCode,200);
    const received=[];for await(const record of records(response))received.push(record);
    assert.equal(Buffer.from(received[0].audio,'base64').readInt16LE(44),101);assert.deepEqual(received.at(-1),{done:true});assert.equal(calls,1);
  });
});
