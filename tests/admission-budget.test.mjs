import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createAppServer} from '../server.mjs';
import {createGuestAllowance} from '../server/guest-allowance.mjs';
const packet={speech:'A complete answer.',emotion:'curious',action:'none',memory:''};
const send=(base,path,body,headers={})=>new Promise((resolve,reject)=>{const request=http.request(base+path,{method:'POST',headers:{host:'nox.example',origin:'https://nox.example','content-type':'application/json',...headers}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});request.on('error',reject);request.end(JSON.stringify(body));});
const post=(base,headers={})=>send(base,'/api/chat',{message:'Hello'},headers);
async function fixture(options,callback){const server=createAppServer({hosted:true,publicHosts:['nox.example'],accessToken:'owner',providers:[{id:'groq',name:'Groq',model:'fixture'}],naturalVoice:false,apiKey:'',speechKey:'',...options});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{await callback(`http://127.0.0.1:${server.address().port}`);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
test('rejected guest requests leave generation capacity for another guest and owner',async()=>{
  let calls=0;const previous=process.env.VERCEL;process.env.VERCEL='1';
  try{await fixture({guestAllowance:createGuestAllowance({url:'',token:''}),providerRequest:async()=>{calls++;return packet;}},async base=>{
      const headers={'x-nox-guest':'1','x-vercel-forwarded-for':'203.0.113.1'};
      const statuses=[];for(let i=0;i<30;i++)statuses.push(await post(base,headers));
      assert.equal(statuses.filter(status=>status===200).length,8);
      assert.equal(await post(base,{...headers,'x-vercel-forwarded-for':'203.0.113.2'}),200);
      assert.equal(await post(base,{authorization:'Bearer owner'}),200);
    });assert.equal(calls,10);
  }finally{if(previous===undefined)delete process.env.VERCEL;else process.env.VERCEL=previous;}
});
test('concurrent accepted requests keep the global ceiling and reserved owner capacity',async()=>{
  let calls=0,takes=0;
  const allowance={status:async()=>null,take:async()=>{takes++;await new Promise(resolve=>setImmediate(resolve));return {allowed:true,usage:null};}};
  await fixture({guestAllowance:allowance,providerRequest:async()=>{calls++;return packet;}},async base=>{
    const guests=await Promise.all(Array.from({length:36},()=>post(base,{'x-nox-guest':'1'})));
    assert.equal(guests.filter(status=>status===200).length,24);
    assert.equal(takes,24,'globally rejected requests do not consume guest allowance');
    const owners=await Promise.all(Array.from({length:10},()=>post(base,{authorization:'Bearer owner'})));
    assert.equal(owners.filter(status=>status===200).length,6);
    assert.equal(calls,30);
  });
});
test('rejected public speech does not consume the owner generation gate',async()=>{
  let speechCalls=0,chatCalls=0;
  await fixture({naturalVoice:true,speechProvider:'groq',speechKey:'fixture',guestAllowance:createGuestAllowance({url:'',token:''}),speech:async()=>{speechCalls++;return Buffer.from('fixture audio');},providerRequest:async()=>{chatCalls++;return packet;}},async base=>{
    const statuses=[];for(let i=0;i<30;i++)statuses.push(await send(base,'/api/speech',{text:'A short phrase.'},{'x-nox-guest':'1'}));
    assert.equal(statuses.filter(status=>status===200).length,4);
    assert.equal(await post(base,{authorization:'Bearer owner'}),200);
  });assert.equal(speechCalls,4);assert.equal(chatCalls,1);
});
test('a disconnected streaming receiver cancels the shared budget without switching models',{timeout:2000},async()=>{
  let calls=0,aborted;const cancellation=new Promise(resolve=>aborted=resolve);
  await fixture({providerRequest:async(_,options)=>{
    calls++;assert.equal(options.deadlineAt> Date.now(),true);options.onText('A partial answer');
    await new Promise((_,reject)=>options.signal.addEventListener('abort',()=>{aborted();reject(Object.assign(Error('Late quota'),{code:'quota'}));},{once:true}));
  }},async base=>{
    await new Promise((resolve,reject)=>{
      const request=http.request(base+'/api/chat',{method:'POST',headers:{host:'nox.example',origin:'https://nox.example','content-type':'application/json','x-nox-guest':'1'}},response=>response.once('data',()=>{response.destroy();resolve();}));
      request.on('error',reject);request.end(JSON.stringify({message:'Hello',stream:true}));
    });await cancellation;assert.equal(calls,1);
  });
});
test('allowance lookup time is included in the original HTTP reply deadline',async()=>{
  let time=1000,deadline;
  await fixture({now:()=>time,guestAllowance:{status:async()=>null,take:async()=>{time+=5000;return {allowed:true,usage:null};}},providerRequest:async(_,options)=>{deadline=options.deadlineAt;return packet;}},async base=>assert.equal(await post(base,{'x-nox-guest':'1'}),200));
  assert.equal(deadline,27000);
});
