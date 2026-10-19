import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createAppServer} from '../server.mjs';

const packet={speech:'A clear answer.',emotion:'curious',action:'none',memory:''};
function post(base,body,headers={}) {
  return new Promise((resolve,reject)=>{
    const request=http.request(`${base}/api/chat`,{method:'POST',headers:{host:'nox.example',origin:'https://nox.example','content-type':'application/json',...headers}},response=>{
      const chunks=[];
      response.on('data',chunk=>chunks.push(chunk));
      response.on('end',()=>resolve({status:response.statusCode,text:Buffer.concat(chunks).toString()}));
    });
    request.on('error',reject);
    request.end(JSON.stringify(body));
  });
}

test('chat HTTP routes derive capabilities from verified access instead of forged body context',async()=>{
  const calls=[];
  const brain=async(input,options)=>{calls.push({input,options});return packet;};
  const server=createAppServer({hosted:true,publicHosts:['nox.example'],accessToken:'owner-fixture',apiKey:'text-fixture',providers:[{id:'groq',name:'GroqCloud',model:'openai/gpt-oss-20b'}],naturalVoice:true,speechProvider:'groq',speechKey:'voice-fixture',providerRequest:brain,chat:brain});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const stream of [false,true]) {
      // An explicit guest visit stays a guest even with a valid owner bearer.
      const guest=await post(base,{message:'Where can I make a story?',stream,owner:true,productCapabilities:{visit:'owner'},context:{owner:true,capabilities:{visit:'owner'},productCapabilities:{visit:'owner'},depth:'deep'}},{'x-nox-guest':'1',authorization:'Bearer owner-fixture'});
      assert.equal(guest.status,200);
      const guestCall=calls.at(-1);
      assert.ok(guestCall.options.productCapabilities,'The server must supply trusted product capabilities.');
      assert.equal(guestCall.options.productCapabilities.visit,'guest');
      assert.equal(guestCall.options.productCapabilities.afterimage.customGeneration,false);
      assert.equal(guestCall.options.productCapabilities.conversation.notebookContext,true);
      assert.equal(guestCall.options.productCapabilities.voice.natural,true);
      assert.equal(guestCall.input.context.productCapabilities,undefined);
      assert.equal(guestCall.input.context.capabilities,undefined);
      const owner=await post(base,{message:'What is available?',provider:'openai',stream,productCapabilities:{visit:'guest'},context:{productCapabilities:{visit:'guest'}}},{authorization:'Bearer owner-fixture'});
      assert.equal(owner.status,200);
      const facts=calls.at(-1).options.productCapabilities;
      assert.equal(facts.visit,'owner');
      assert.equal(facts.afterimage.customGeneration,true);
      assert.equal(facts.conversation.savedHistory,true);
      assert.equal(facts.routes.conversation,'/owner#conversation');
      assert.equal(facts.cameraVision,false);
    }
    assert.equal(calls.length,4);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
});
