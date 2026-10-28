import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createAppServer} from '../server.mjs';
import {requestSpeech} from '../server/speech.mjs';
import {fixtureWav} from './helpers/wav.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const packet={speech:'A complete answer.',emotion:'curious',action:'none',memory:''};
const modes=[['chat',false,'JSON'],['chat',true,'SSE'],['speech',false,'audio'],['speech',true,'NDJSON']];

async function withServer(options,run){
  const server=createAppServer({hosted:true,publicHosts:['nox.example'],accessToken:'owner',providers:[{id:'groq',name:'Groq',model:'fixture'}],apiKey:'',naturalVoice:true,speechProvider:'groq',speechKey:'fixture',...options});
  // Observe completion of the real HTTP handler as well as its socket events.
  const handler=server.listeners('request')[0],received=[],waiting=[];
  server.off('request',handler);
  server.on('request',(request,response)=>{
    const exchange={request,response,completed:handler(request,response)};
    if(waiting.length)waiting.shift()(exchange);else received.push(exchange);
  });
  const nextRequest=()=>received.length?Promise.resolve(received.shift()):new Promise(resolve=>waiting.push(resolve));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await run(`http://127.0.0.1:${server.address().port}`,nextRequest);}
  finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

test('a disconnected audio receiver stops waiting without canceling synthesis shared by another receiver',{timeout:2000},async()=>{
  const entered=deferred(),synthesis=deferred();let calls=0,upstreamSignal;
  const fetchImpl=(_url,{signal})=>{calls++;upstreamSignal=signal;entered.resolve();return synthesis.promise;};
  await withServer({speech:(input,options)=>requestSpeech(input,{...options,fetchImpl})},async(base,nextRequest)=>{
    const headers={'x-nox-guest':'0',authorization:'Bearer owner'},body={text:'A shared phrase.'};
    const first=open(base,'speech',body,headers);first.response.catch(()=>{});
    const firstExchange=await nextRequest();await entered.promise;
    const second=open(base,'speech',body,headers),secondExchange=await nextRequest();
    if(!secondExchange.request.readableEnded)await once(secondExchange.request,'end');
    await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);
    const closed=once(firstExchange.response,'close');first.request.destroy();await closed;
    let timer;
    try{
      assert.equal(await Promise.race([firstExchange.completed.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),500);})]),true,'a disconnected caller releases its handler before shared synthesis settles');
      assert.equal(upstreamSignal.aborted,false,'the remaining receiver still owns the shared synthesis');
    }finally{clearTimeout(timer);synthesis.resolve(new Response(fixtureWav([101]),{headers:{'content-type':'audio/wav'}}));}
    const response=await second.response,chunks=[];for await(const chunk of response)chunks.push(chunk);
    await secondExchange.completed;assert.equal(response.statusCode,200);assert.equal(Buffer.concat(chunks).readInt16LE(44),101);assert.equal(calls,1);
  });
});
function open(base,route,body,headers={}){
  const response=deferred();
  const request=http.request(`${base}/api/${route}`,{method:'POST',headers:{host:'nox.example',origin:'https://nox.example','content-type':'application/json','x-nox-guest':'1',...headers}},response.resolve);
  request.on('error',response.reject);request.end(JSON.stringify(body));
  return {request,response:response.promise};
}
async function collect(response){const chunks=[];for await(const chunk of response)chunks.push(chunk);return Buffer.concat(chunks).toString();}

for(const [route,stream,label] of modes){
  const body=route==='chat'?{message:'Hello',stream}:{text:'Hello',stream};
  test(`${route} ${label} does not generate after a disconnect while allowance is pending`,{timeout:2000},async()=>{
    const entered=deferred(),allowance=deferred();let calls=0;
    const generate=async()=>{calls++;return route==='chat'?packet:Buffer.from('audio');};
    await withServer({guestAllowance:{status:async()=>null,take:async()=>{entered.resolve();return allowance.promise;}},providerRequest:generate,speech:generate},async(base,nextRequest)=>{
      const pending=open(base,route,body);pending.response.catch(()=>{});
      const exchange=await nextRequest();await entered.promise;
      const closed=once(exchange.response,'close');pending.request.destroy();await closed;
      allowance.resolve({allowed:true,usage:null});await new Promise(resolve=>setImmediate(resolve));
      assert.equal(calls,0,'a receiver that left before admission must never start generation');
      await exchange.completed;
    });
  });

  test(`${route} ${label} generates once for a live receiver and completes without cancellation`,{timeout:2000},async()=>{
    const entered=deferred(),allowance=deferred(),signals=[];let calls=0;
    const generate=async(_input,{signal})=>{calls++;if(signal){signals.push(signal);assert.equal(signal.aborted,false);}return route==='chat'?packet:Buffer.from('audio');};
    await withServer({guestAllowance:{status:async()=>null,take:async()=>{entered.resolve();return allowance.promise;}},providerRequest:generate,speech:generate},async(base,nextRequest)=>{
      const pending=open(base,route,body),exchange=await nextRequest();await entered.promise;
      allowance.resolve({allowed:true,usage:null});
      const response=await pending.response,text=await collect(response);await exchange.completed;
      assert.equal(response.statusCode,200);assert.equal(calls,1);
      if(route==='chat')assert.match(text,/A complete answer\./);
      else if(stream)assert.deepEqual(text.trim().split('\n').map(JSON.parse),[{index:0,audio:'YXVkaW8=',type:'audio/wav'},{done:true}]);
      else assert.equal(text,'audio');
      assert.ok(signals.every(signal=>!signal.aborted),'normal request/response completion is not cancellation');
      assert.equal(exchange.request.listenerCount('aborted'),0,'request cancellation listener is cleaned up');
      assert.equal(exchange.response.listenerCount('close'),0,'response cancellation listener is cleaned up');
    });
  });
}
