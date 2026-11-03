import test from 'node:test';
import assert from 'node:assert/strict';
import {requestProvider} from '../server/providers.mjs';
import {IDENTITY,requestNox} from '../server/ai.mjs';
import {capabilitiesForModel,productInstructions} from '../shared/product-capabilities.js';

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
    // Question: does each provider get the conversational greeting and identity policy?
    // Limits: transport fixtures establish prompt delivery, not model compliance.
    assert.match(instructions,/Match a simple greeting with a brief, natural greeting/);
    assert.match(instructions,/If asked who you are, answer briefly as NOX, an AI companion/);
    assert.match(instructions,/Do not justify an age-coded description by calling it a vibe/);
    assert.doesNotMatch(instructions,/\bboyish\b/i);
    const facts=productData(instructions);
    assert.equal(facts.visit,'guest');
    assert.deepEqual(facts.conversation.depths,['quick','balanced']);
    assert.equal(facts.conversation.savedHistory,false);
    assert.equal(facts.conversation.notebookContext,true);
    assert.equal(facts.afterimage.customGeneration,false);
    assert.equal(facts.afterimage.authoredExample,true);
    assert.equal(facts.routes.conversation,'/guest#conversation');
    assert.equal(facts.routes.codePreparation,'/guest#prepare-code');
    assert.equal(facts.routes.afterimage,'/guest#afterimage');
    assert.equal(facts.cameraVision,false);
    assert.equal(facts.presence.autonomousWandering,false);
    assert.match(facts.presence.gravity,/falls vertically/i);
    assert.match(facts.presence.gravity,/at most one small 24px landing rebound.*then settles/i);
    assert.match(facts.presence.stopGravity,/current position without moving/i);
    assert.match(facts.presence.stopGravity,/Park NOX explicitly returns him near the composer/);
    assert.match(instructions,/Disabling gravity in conversation stops the fall without moving NOX/);
    assert.ok(facts.controls.presence.includes('Park NOX'));
  }
});

test('character instructions distinguish stopping conversation gravity from explicit parking',()=>{
  assert.match(IDENTITY,/at most one small 24px landing rebound.*then settle/);
  assert.match(IDENTITY,/Disabling gravity in conversation stops the fall at your current position without moving you/);
  assert.match(IDENTITY,/Park NOX explicitly moves you near the composer/);
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

// Question: can either visit get accurate guidance for shipped source controls without granting repository tools?
// Limits: prompt delivery verifies available facts, not whether a hosted model follows them or explains code well.
for(const owner of [false,true])test(`${owner?'owner':'guest'} instructions describe bounded, visit-only code preparation`,()=>{
  const instructions=productInstructions(capabilitiesForModel({owner})),facts=productData(instructions);
  assert.deepEqual(facts.controls.codePreparation,['Prepare with code','Close code preparation','Open code','GitHub','Local file','Paste code','Browse repository','Open a local source file','Open pasted code','Try a small example','Try a four-line spoken example','View source','Previous section','Next section','Explain these lines','Ask me about them','Hear line by line','Play walkthrough again','Stop walkthrough','Choose a complete section','Select range','I can explain this section','My goal & corrections','Export preparation sheet']);
  assert.equal(facts.codePreparation.available,true);assert.equal(facts.codePreparation.readOnly,true);
  assert.equal(facts.codePreparation.executesCode,false);assert.equal(facts.codePreparation.privateRepositoryAccess,false);assert.equal(facts.codePreparation.wholeRepositoryContext,false);
  assert.deepEqual(facts.codePreparation.imports,['Public GitHub repository root URL, pinned to a commit; select a supported text source file.','Local UTF-8 text source file.','Pasted code with a file name.','Authored examples.']);
  assert.deepEqual(facts.codePreparation.limits,{fileBytes:65536,fileLines:2000,selectedLines:80,selectedCharacters:6000,spokenLines:4,filesPerVisit:12,repliesPerSheet:80});
  assert.equal(facts.codePreparation.importedSourcePersists,false);
  assert.match(facts.codePreparation.context,/selected lines, goal and corrections/i);assert.match(facts.codePreparation.context,/dependencies.*explicitly/i);
  assert.match(facts.codePreparation.voice,/playback starts/i);assert.match(facts.codePreparation.voice,/written answer.*kept/i);
  assert.match(facts.codePreparation.storage,owner?/owner chat replies.*browser history/i:/guest chat replies.*refresh/i);
  assert.equal(facts.externalTools,false);assert.equal(facts.routes.conversation,owner?'/owner#conversation':'/guest#conversation');
  assert.match(instructions,/Code preparation is optional inside conversation/);assert.match(instructions,/cannot run code, access private repositories or inspect the whole repository/);
});
