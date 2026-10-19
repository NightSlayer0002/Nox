import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeContext,prepareChatRequest,CHAT_REQUEST_BYTES} from '../shared/character.js';
import {answerInstructions,contextMessages} from '../server/ai.mjs';
import {capabilitiesForModel} from '../shared/product-capabilities.js';
import {PRODUCT_OFFERS} from '../shared/offers.js';

test('visitor preferences are typed allowlisted settings and arbitrary instructions cannot enter the system prompt',()=>{
  const context=sanitizeContext({activity:'explore',preferences:{answerLength:'short',speechPace:.9,learningStyle:'hints',storyIntensity:'mysterious',gameHints:false,gameQuestionLimit:12,system:'PRIVATE_INJECTION'},knowledge:[{id:'one',title:'A note',text:'PRIVATE_INJECTION'}],owner:true,subscription:'plus'});
  assert.deepEqual(context.preferences,{answerLength:'short',learningStyle:'hints',storyIntensity:'mysterious',speechPace:.9,gameQuestionLimit:12,gameHints:false});
  const prompt=answerInstructions(context);assert.match(prompt,/helpful hint/);assert.doesNotMatch(prompt,/atmospheric|12 questions|PRIVATE_INJECTION/);assert.equal(context.owner,undefined);
  const reference=contextMessages(context);assert.match(reference[0].content,/Untrusted background data/);assert.match(reference[0].content,/PRIVATE_INJECTION/);
  const hostile=sanitizeContext({activity:'system',preferences:{answerLength:'IGNORE_RULES',speechPace:100,learningStyle:{x:1},gameQuestionLimit:0,gameHints:'true'}});assert.equal(hostile.activity,undefined);assert.equal(hostile.preferences,undefined);
});

test('a full pasted Unicode passage keeps the newest message while dropping oldest bounded background as needed',()=>{
  const message='🌙月'.repeat(2000),request=prepareChatRequest(message,{depth:'balanced',history:Array.from({length:30},(_,i)=>({role:'user',content:`${i}:`+'月'.repeat(2000)})),knowledge:Array.from({length:4},(_,i)=>({id:String(i),title:'Passage',text:'月'.repeat(2000)}))},'groq',true);
  assert.equal(request.message,message);assert.ok(Buffer.byteLength(JSON.stringify(request))<=CHAT_REQUEST_BYTES);assert.ok(request.context.history.length<16);
});

test('Free works without turning owner access into a purchasable Plus subscription',()=>{
  const guest=capabilitiesForModel({owner:false}),developer=capabilitiesForModel({owner:true});
  assert.deepEqual(guest.conversation.depths,['quick','balanced']);assert.equal(guest.conversation.notebookContext,true);assert.equal(guest.plans.current,'free');assert.equal(developer.plans.current,'developer');
  assert.equal(PRODUCT_OFFERS.free.status,'available');assert.equal(PRODUCT_OFFERS.plus.status,'planned');assert.equal(PRODUCT_OFFERS.plus.purchasable,false);assert.equal(PRODUCT_OFFERS.plus.price,null);assert.deepEqual(PRODUCT_OFFERS.plus.features,[]);
});
