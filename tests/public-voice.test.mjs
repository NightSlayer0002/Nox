import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createAppServer} from '../server.mjs';
import {createPublicQuota} from '../server/public-quota.mjs';
const request=(base,path,body,origin='https://nox.example')=>new Promise((resolve,reject)=>{const req=http.request(base+path,{method:body?'POST':'GET',headers:{host:'nox.example',origin,'content-type':'application/json'}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString()}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
test('public Groq voice works while the owner brain remains protected',async()=>{
  let calls=0;const server=createAppServer({hosted:true,publicHosts:['nox.example'],accessToken:'owner',apiKey:'',providers:[],naturalVoice:true,speechProvider:'groq',speechKey:'fixture',speech:async(input,options)=>{calls++;assert.equal(options.voice,'troy');return Buffer.from('RIFF');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const status=JSON.parse((await request(base,'/api/status')).text);assert.equal(status.voice,'natural');assert.equal(status.access,'locked');
    assert.equal((await request(base,'/api/chat',{message:'Hi'})).status,401);
    assert.equal((await request(base,'/api/speech',{text:'Hello',voice:'hannah'},'https://foreign.example')).status,403);
    for(let i=0;i<4;i++)assert.equal((await request(base,'/api/speech',{text:`Hello ${i}`,voice:'hannah'})).status,200);
    const limited=await request(base,'/api/speech',{text:'Extra'});assert.equal(limited.status,429);assert.ok(Number(limited.headers['retry-after'])>0);assert.equal(calls,4);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('public quota bounds clients and expires without allowing quota bypass by new identities',()=>{
  let now=0;const quota=createPublicQuota({now:()=>now,total:3,perClient:2,maxClients:2});assert.equal(quota.take('a'),0);assert.equal(quota.take('a'),0);assert.ok(quota.take('a')>0);assert.equal(quota.take('b'),0);assert.ok(quota.take('c')>0);now=60000;assert.equal(quota.take('c'),0);
});
