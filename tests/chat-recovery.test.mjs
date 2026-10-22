import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHistory} from '../public/js/history.js';
import {createTurnGate} from '../public/js/turns.js';
import {prepareChatRequest,explicitMemoryRequest} from '../shared/character.js';
import {readChatStream} from '../public/js/stream.js';
import {selfDeclaredName} from '../public/js/name-intent.js';
import {historyFailure} from '../public/js/history-notice.js';

// Exercise the production send boundary with real history, request preparation,
// and response parsing, without starting the canvas or making provider requests.
const appSource=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
const start=appSource.indexOf('async function send('),end=appSource.indexOf('\nconst greetings =',start);
assert.ok(start>=0&&end>start,'the app exposes its send boundary');
const sendSource=appSource.slice(start,end);
const noop=()=>{};
const packet={speech:'A complete answer.',emotion:'curious',action:'none',memory:''};
const failed=()=>Response.json({error:'The connection failed. Try again.'},{status:503});
const answered=()=>Response.json(packet);

async function fixture(responses){
  const stored=new Map(),history=await createHistory({getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,String(value))});
  const nodes=new Map(),messages=[],requests=[];
  function $(id){if(!nodes.has(id))nodes.set(id,{value:id==='reply-depth'?'balanced':'',lastChild:{textContent:''},focus:noop,scrollHeight:100});return nodes.get(id);}
  function addMessage(role,text){const content={textContent:text},node={role,content,removed:false,classList:{add:noop},querySelector:()=>content,append:noop,remove(){this.removed=true;}};messages.push(node);return node;}
  const context=vm.createContext({
    $,history,prepareChatRequest,explicitMemoryRequest,readChatStream,selfDeclaredName,historyFailure,AbortController,TextEncoder,clearTimeout,setTimeout,
    composerOptions:{close:noop},composer:{setValue:value=>{$('message').value=value;}},
    editTarget:null,currentActivity:'conversation',brain:'live',busy:false,mode:'companion',selectedProvider:'',
    summaryController:null,summaryTimer:null,pendingDraft:null,activityTurn:null,
    turns:createTurnGate(),activity:{beginTurn:()=>1,transition:noop,finishTurn:noop},
    replyDiagnostics:{begin:()=>1,complete:noop,setStatus:noop},
    afterimageBridge:{stop:noop},memory:{setName:noop},visit:{owner:false},
    approvedPreferences:{context:()=>({})},knowledge:{context:()=>[]},companionBridge:{propose:noop},
    applyApprovedPreferences:noop,apiHeaders:()=>({}),contextPreview:noop,updateMemory:noop,
    navigation:{render:noop},companionChanged:noop,voice:{stop:noop},microphone:{stop:noop},
    stage:{character:{react:noop},run:noop},addMessage,attachMessageActions:noop,
    scheduleSummary:noop,setUsage:noop,toast:noop,openSettings:noop,refreshConnection:noop,
    async fetch(url,options){assert.equal(url,'/api/chat');requests.push(JSON.parse(options.body));const respond=responses.shift();assert.ok(respond,'unexpected request');return respond();},
    async perform(value){if(await history.append('assistant',value.speech))return value;},
    async restoreConversation(){},
  });
  context.setBusy=value=>{context.busy=value;};
  const send=vm.runInContext(`(${sendSource})`,context);
  return {send,history,messages,requests,nodes,$};
}

test('resending the restored failed draft reuses its user turn and excludes duplicate provider context',async()=>{
  const {send,history,messages,requests,$}=await fixture([failed,answered]);
  const question='Why does the Moon change shape?';
  await send(question);
  assert.equal($('message').value,question);
  assert.deepEqual(history.active().turns.map(turn=>turn.content),[question]);
  await send($('message').value);
  assert.deepEqual(history.active().turns.map(turn=>turn.content),[question,packet.speech]);
  assert.deepEqual(requests[1].context.history,[]);
  assert.equal(messages.filter(message=>message.role==='user').length,1);
  assert.equal($('message').value,'');
});

test('repeated failures keep one recoverable user turn',async()=>{
  const {send,history,$}=await fixture([failed,failed,failed]);
  const question='Help me with this question.';
  for(let attempt=0;attempt<3;attempt++){
    await send(question);
    assert.equal($('message').value,question);
    assert.deepEqual(history.active().turns.map(turn=>turn.content),[question]);
  }
});

test('a repeated question after a completed answer is a new user turn',async()=>{
  const {send,history,requests}=await fixture([answered,answered]);
  const question='Could you explain that?';
  await send(question);await send(question);
  assert.deepEqual(history.active().turns.map(turn=>turn.content),[question,packet.speech,question,packet.speech]);
  assert.equal(requests[1].context.history.length,2);
});

test('changing the failed draft preserves the original sent question as context',async()=>{
  const {send,history,requests}=await fixture([failed,answered]);
  await send('First question');await send('A different question');
  assert.deepEqual(history.active().turns.map(turn=>turn.content),['First question','A different question',packet.speech]);
  assert.deepEqual(requests[1].context.history,[{role:'user',content:'First question'}]);
});
