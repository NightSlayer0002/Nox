import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../server.mjs';
const packet={speech:'Already done. No need to tap anything.',emotion:'happy',action:'none',memory:''};
test('guest chat advertises the production model and reports the actual single fallback',async()=>{
  const models=[];
  const server=createAppServer({hosted:false,accessToken:'',apiKey:'',providers:[{id:'groq',name:'GroqCloud',model:'configured-owner-model'}],naturalVoice:false,providerRequest:async(_,options)=>{models.push(options.model);if(models.length===1)throw Object.assign(Error('quota'),{code:'quota'});return packet;}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const status=await(await fetch(base+'/api/status')).json();assert.equal(status.guestProvider.model,'openai/gpt-oss-120b');
    const response=await fetch(base+'/api/chat',{method:'POST',headers:{'content-type':'application/json','x-nox-guest':'1',origin:base},body:JSON.stringify({message:'You already did it.',context:{depth:'balanced'}})});
    assert.equal(response.status,200);const value=await response.json();assert.equal(value.speech,packet.speech);
    assert.deepEqual(models,['openai/gpt-oss-120b','openai/gpt-oss-20b']);assert.equal(value.metrics.model,'openai/gpt-oss-20b');assert.equal(value.metrics.fallbackReason,'quota');
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
