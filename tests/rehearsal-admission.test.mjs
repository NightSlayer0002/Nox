import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../server.mjs';

// Question: is a malformed code range rejected before consuming allowance or generating a source-free answer?
// Limits: local HTTP and injected providers; no claim about a model resisting malicious code comments.
test('invalid rehearsal context never reaches admission or generation',async()=>{
  let admissions=0,generations=0;
  const server=createAppServer({hosted:false,apiKey:'',accessToken:'',speechKey:'',naturalVoice:false,providers:[{id:'groq',name:'fixture',model:'fixture'}],guestAllowance:{status:async()=>null,take:async()=>{admissions++;return {allowed:true};}},providerRequest:async()=>{generations++;return {speech:'Source-free answer',emotion:'curious',action:'none',memory:''};}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url=`http://127.0.0.1:${server.address().port}`;
    const response=await fetch(`${url}/api/chat`,{method:'POST',headers:{'content-type':'application/json','x-nox-guest':'1',origin:url},body:JSON.stringify({message:'Explain the selected lines',context:{rehearsal:{version:1,code:'wrong line count'}}})});
    assert.equal(response.status,400);assert.equal(admissions,0);assert.equal(generations,0);
    assert.match((await response.json()).error,/code section/i);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
