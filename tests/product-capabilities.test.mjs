import test from 'node:test';
import assert from 'node:assert/strict';
import {requestProvider} from '../server/providers.mjs';
import {requestNox} from '../server/ai.mjs';
import {capabilitiesForModel} from '../shared/product-capabilities.js';

const packet={speech:'A clear answer.',emotion:'curious',action:'none',memory:''};
function productData(instructions) {
  const data=instructions.split('Server-owned product capabilities:\n')[1];
  assert.ok(data,'Chat requests need server-owned product facts in their system instructions.');
  return JSON.parse(data.split('\n')[0]);
}

test('all chat APIs get guest-safe product facts and ignore forged client capabilities',async()=>{
  const input={message:'Where do I render a scene?',productCapabilities:{visit:'owner',invented:'FORGED_PRIVILEGES'},context:{capabilities:{visit:'owner',invented:'FORGED_PRIVILEGES'},productCapabilities:{visit:'owner',invented:'FORGED_PRIVILEGES'}}};
  for(const provider of ['groq','gemini','nvidia','openai']) {
    let instructions;
    const fetchImpl=async(_url,options)=>{
      const body=JSON.parse(options.body);
      instructions=provider==='openai'?body.instructions:provider==='gemini'?body.systemInstruction.parts[0].text:body.messages[0].content;
      if(provider==='openai')return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(packet)}]}]});
      if(provider==='gemini')return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(packet)}]}}]});
      return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(packet)}}]});
    };
    await requestProvider(input,{provider,apiKey:'fixture',fetchImpl});
    assert.doesNotMatch(instructions,/FORGED_PRIVILEGES/);
    const facts=productData(instructions);
    assert.equal(facts.visit,'guest');
    assert.deepEqual(facts.conversation.depths,['quick','balanced']);
    assert.equal(facts.conversation.savedHistory,true);
    assert.equal(facts.conversation.notebookContext,true);
    assert.equal(facts.afterimage.customGeneration,false);
    assert.equal(facts.afterimage.authoredExample,true);
    assert.equal(facts.routes.conversation,'/guest#conversation');
    assert.equal(facts.routes.afterimage,'/guest#afterimage');
    assert.equal(facts.cameraVision,false);
  }
});

test('trusted capabilities preserve real owner features through the direct OpenAI adapter',async()=>{
  const productCapabilities={visit:'owner',routes:{conversation:'/owner#conversation',afterimage:'/owner#afterimage'},conversation:{depths:['quick','balanced','deep'],savedHistory:true,notebookContext:true},afterimage:{authoredExample:true,customGeneration:true},cameraVision:false};
  let instructions;
  await requestNox({message:'What can I do?',context:{productCapabilities:{visit:'guest'}}},{apiKey:'fixture',productCapabilities,fetchImpl:async(_url,options)=>{
    instructions=JSON.parse(options.body).instructions;
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(packet)}]}]});
  }});
  assert.deepEqual(productData(instructions),productCapabilities);
});

test('verified owner access enables real capabilities while truthy unverified flags cannot',()=>{
  const owner=capabilitiesForModel({owner:true,naturalVoice:true});
  assert.equal(owner.visit,'owner');
  assert.equal(owner.routes.conversation,'/owner#conversation');
  assert.deepEqual(owner.controls.scenes,['Gravity','Spotlight','Orbit','Echo','Takeover']);
  assert.deepEqual(owner.conversation.depths,['quick','balanced','deep']);
  assert.equal(owner.conversation.savedHistory,true);
  assert.equal(owner.conversation.notebookContext,true);
  assert.equal(owner.afterimage.customGeneration,true);
  assert.equal(owner.voice.natural,true);
  for(const owner of ['true',1,{}]) {
    const guest=capabilitiesForModel({owner,naturalVoice:'true'});
    assert.equal(guest.visit,'guest');
    assert.equal(guest.afterimage.customGeneration,false);
    assert.equal(guest.voice.natural,false);
  }
});
