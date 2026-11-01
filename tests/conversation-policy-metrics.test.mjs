import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../server.mjs';
import {CONVERSATION_POLICY_VERSION,CONVERSATION_POLICY_SHA256} from '../server/conversation-policy.mjs';

// Question: can an evaluator identify the prompt policy loaded by the responding server?
// Limits: a version/hash proves deployed wording identity, not model adherence or human preference.
test('chat metrics identify the loaded companion policy without conversation contents',async()=>{
  const server=createAppServer({hosted:false,apiKey:'',accessToken:'',speechKey:'',naturalVoice:false,providers:[{id:'groq',name:'fixture',model:'fixture'}],guestAllowance:{status:async()=>null,take:async()=>({allowed:true})},providerRequest:async()=>({speech:'Hello.',emotion:'curious',action:'none',memory:''})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url=`http://127.0.0.1:${server.address().port}`,response=await fetch(`${url}/api/chat`,{method:'POST',headers:{'content-type':'application/json','x-nox-guest':'1',origin:url},body:JSON.stringify({message:'private example',context:{}})});
    assert.equal(response.status,200);const {metrics}=await response.json();
    assert.equal(metrics.conversationPolicyVersion,CONVERSATION_POLICY_VERSION);assert.equal(metrics.conversationPolicyHash,CONVERSATION_POLICY_SHA256);assert.doesNotMatch(JSON.stringify(metrics),/private example/);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
