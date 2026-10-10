import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {createAppServer} from '../server.mjs';
const request=(base,path,body,headers={})=>new Promise((resolve,reject)=>{const req=http.request(base+path,{method:body?'POST':'GET',headers:{host:'nox.example',origin:'https://nox.example','content-type':'application/json',...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,text:Buffer.concat(chunks).toString()}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
test('guest trial uses fixed Groq quick replies without owner memory or other protected capabilities',async()=>{
  let calls=0;const groq={id:'groq',name:'GroqCloud',model:'openai/gpt-oss-20b'};
  const server=createAppServer({hosted:true,publicHosts:['nox.example'],accessToken:'owner',apiKey:'',providers:[groq],naturalVoice:false,speechKey:'',providerRequest:async(input,options)=>{calls++;assert.equal(options.provider,'groq');assert.equal(options.model,'openai/gpt-oss-20b');assert.equal(input.context.depth,'quick');assert.equal(input.context.name,'');assert.deepEqual(input.context.facts,[]);assert.equal(input.context.knowledge,undefined);assert.equal(input.context.summary,undefined);return {speech:'I am NOX.',emotion:'happy',action:'none',memory:'guest must not save model memory'};}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const guest={'x-nox-guest':'1'};
    const metadata=JSON.parse((await request(base,'/api/status',null,guest)).text);assert.equal(metadata.owner,false);assert.deepEqual(metadata.guestProvider,groq);
    assert.equal((await request(base,'/api/chat',{message:'Hi'})).status,401);
    assert.equal((await request(base,'/api/chat',{message:'Old private context',context:{facts:['PRIVATE']}},{'x-nox-owner':'1'})).status,401);
    assert.equal((await request(base,'/api/chat',{message:'Hi',provider:'openai'},guest)).status,400);
    const response=await request(base,'/api/chat',{message:'Hello',context:{name:'PRIVATE',facts:['PRIVATE'],knowledge:[{id:'x',title:'owner',text:'PRIVATE'}],summary:'PRIVATE',depth:'deep'}},guest);assert.equal(response.status,200);assert.equal(JSON.parse(response.text).memory,'');
    assert.equal((await request(base,'/api/summary',{turns:[]},guest)).status,401);assert.equal((await request(base,'/api/afterimage',{seed:'Moon',tone:'wonder'},guest)).status,401);
    assert.equal((await request(base,'/api/chat',{message:'x'.repeat(601)},guest)).status,400);assert.equal(calls,1);
    assert.equal((await request(base,'/guest')).status,200);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
