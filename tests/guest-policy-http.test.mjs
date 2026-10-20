import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {createAppServer} from '../server.mjs';
import {readChatStream} from '../public/js/stream.js';
const request=(base,path,body,headers={})=>new Promise((resolve,reject)=>{const req=http.request(base+path,{method:body?'POST':'GET',headers:{host:'nox.example',origin:'https://nox.example','content-type':'application/json',...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString()}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
async function withServer(options,callback){const server=createAppServer({hosted:true,publicHosts:['nox.example'],accessToken:'owner',providers:[{id:'groq',name:'Groq',model:'fixture'}],apiKey:'',speechKey:'fixture',naturalVoice:true,...options});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await callback(`http://127.0.0.1:${server.address().port}`);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}

test('free allowance errors carry Retry-After and prevent provider spending',async()=>{
  let calls=0;const usage={mode:'daily',text:{limit:20,used:20,remaining:0,resetsAt:'2026-10-20T00:00:00.000Z'}};
  await withServer({guestAllowance:{status:async()=>usage,take:async(_client,kind)=>({allowed:false,code:kind==='text'?'daily_limit':'allowance_unavailable',retryAfter:30,usage})},providerRequest:async()=>{calls++;},speech:async()=>{calls++;}},async base=>{
    const limited=await request(base,'/api/chat',{message:'Keep this draft'},{'x-nox-guest':'1'});assert.equal(limited.status,429);assert.equal(limited.headers['retry-after'],'30');assert.equal(JSON.parse(limited.text).usage.text.remaining,0);
    const unavailable=await request(base,'/api/speech',{text:'Still have text.'},{'x-nox-guest':'1'});assert.equal(unavailable.status,503);assert.equal(JSON.parse(unavailable.text).code,'allowance_unavailable');assert.equal(calls,0);
  });
});

test('full written answers and separate natural speech usage survive both chat response paths',async()=>{
  const speech='A useful explanation with complete sentences. '.repeat(25).trim(),usage={mode:'daily',text:{limit:20,used:1,remaining:19}};
  const calls=[];
  await withServer({guestAllowance:{status:async()=>usage,take:async(_client,kind)=>{calls.push(kind);return {allowed:true,usage};}},providerRequest:async(input)=>{assert.equal(input.context.depth,'balanced');return {speech,emotion:'curious',action:'none',memory:''};},speech:async()=>Buffer.from([1,2])},async base=>{
    for(const stream of [false,true]) {
      const response=await request(base,'/api/chat',{message:'Explain a subject',stream},{'x-nox-guest':'1'});assert.equal(response.status,200);
      const packet=stream?JSON.parse(response.text.split('\n').find(line=>line.startsWith('data: ')&&line.includes('"metrics"')).slice(6)):JSON.parse(response.text);
      assert.equal(packet.speech,speech);assert.deepEqual(packet.usage,usage);
    }
    const voice=await request(base,'/api/speech',{text:'A concise spoken opening.'},{'x-nox-guest':'1'});assert.equal(voice.status,200);assert.deepEqual(JSON.parse(voice.headers['x-nox-usage']),usage);
    assert.deepEqual(calls,['text','text','speech']);
    assert.equal((await request(base,'/api/speech',{text:'x'.repeat(421)},{'x-nox-guest':'1'})).status,400);
    assert.deepEqual(calls,['text','text','speech']);
  });
});

for(const stream of [false,true])test(`charged provider failures retain updated public usage in ${stream?'streamed':'JSON'} errors`,async()=>{
  let used=0;
  const snapshot=()=>({mode:'daily',scope:'shared-network',text:{limit:1,used,remaining:1-used},speech:{limit:2,used:0,remaining:2}});
  const guestAllowance={status:async()=>snapshot(),take:async(_client,kind)=>{assert.equal(kind,'text');used++;return {allowed:true,usage:snapshot()};}};
  const warnings=[],originalWarn=console.warn;console.warn=message=>warnings.push(message);
  try{
    await withServer({guestAllowance,providerRequest:async()=>{throw Object.assign(new Error('PRIVATE_UPSTREAM_BODY_AND_KEY'),{code:'credentials',providerStatus:401,providerCode:'invalid_api_key'});}},async base=>{
      const response=await request(base,'/api/chat',{message:'Keep my question',stream},{'x-nox-guest':'1'});
      assert.equal(response.status,stream?200:502);
      const expected=snapshot();
      if(stream){
        const body=new Response(response.text,{headers:{'content-type':response.headers['content-type']}});
        await assert.rejects(readChatStream(body,()=>{}),error=>{
          assert.deepEqual(error.usage,expected);
          assert.match(error.message,/provider rejected/);
          return true;
        });
      }else{
        const error=JSON.parse(response.text);
        assert.deepEqual(error.usage,expected);
        assert.match(error.error,/provider rejected/);
      }
      assert.equal(used,1,'failed provider attempts remain charged exactly once');
      assert.doesNotMatch(response.text,/PRIVATE_UPSTREAM_BODY_AND_KEY/);
    });
    assert.equal(warnings.length,1);
    assert.doesNotMatch(warnings.join('\n'),/PRIVATE_UPSTREAM_BODY_AND_KEY/);
  }finally{console.warn=originalWarn;}
});
