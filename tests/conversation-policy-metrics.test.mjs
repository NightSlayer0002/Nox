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

// Question: does a challenge to NOX’s own age label get corrected consistently while vocabulary questions still reach the provider?
// Limits: exercises both HTTP response formats with a synthetic provider, without measuring model replies.
test('a repeated age label corrects NOX’s own previous introduction only',async()=>{
  let generated=0;
  const server=createAppServer({hosted:false,apiKey:'',accessToken:'',speechKey:'',naturalVoice:false,
    providers:[{id:'groq',name:'fixture',model:'fixture'}],guestAllowance:{status:async()=>null,take:async()=>({allowed:true})},
    providerRequest:async()=>{generated++;return {speech:'Provider answer.',emotion:'curious',action:'none',memory:''};}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const origin=`http://127.0.0.1:${server.address().port}`;
    const send=(message,content,{role='assistant',stream=false}={})=>fetch(`${origin}/api/chat`,{
      method:'POST',headers:{'content-type':'application/json','x-nox-guest':'1',origin},
      body:JSON.stringify({message,stream,context:{history:[{role,content}]}}),
    });
    const oldIntroduction='Hey there, I’m NOX, your floating companion—boyish, curious, and a bit dry-witted.';
    const response=await send('boyish?',oldIntroduction);
    assert.equal(response.status,200);
    const packet=await response.json();
    assert.match(packet.speech,/I don’t have a human age/);
    assert.equal(packet.metrics.provider,'Local');
    assert.equal(packet.action,'none');assert.equal(packet.memory,'');
    const streamed=await send('“teen-aged sidekick?”','I’m a teen-aged sidekick.',{stream:true});
    assert.match(await streamed.text(),/event: final\ndata: .*I don’t have a human age/);
    assert.equal(generated,0);

    for(const [message,content,role] of [
      ['What does boyish mean?',oldIntroduction,'assistant'],
      ['boyish?',oldIntroduction,'user'],
      ['boyish?','The book describes its narrator as boyish.','assistant'],
    ]){
      const reply=await send(message,content,{role});
      assert.equal((await reply.json()).speech,'Provider answer.');
    }
    assert.equal(generated,3);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
