import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHistory} from '../public/js/history.js';
import {createTurnGate} from '../public/js/turns.js';
import {normalizePacket,prepareChatRequest,explicitMemoryRequest} from '../shared/character.js';
import {readChatStream} from '../public/js/stream.js';
import {selfDeclaredName} from '../public/js/name-intent.js';
import {historyFailure} from '../public/js/history-notice.js';
import {spokenPreview} from '../public/js/reply.js';
import {createReplyPresentation} from '../public/js/reply-presentation.js';
import {observeInterface} from '../public/js/interface-observation.js';
import {attachVoiceCall} from '../public/js/voice-call-controls.js';

const source=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
function between(start,end){const first=source.indexOf(start),last=source.indexOf(end,first);assert.ok(first>=0&&last>first);return source.slice(first,last);}
const sendSource=between('async function send(','\nconst greetings =');
const performSource=between('async function perform(','\nfunction setBusy(');
const cancelSource=between('function cancelConversation()','\nasync function restoreConversation');
const restoreSource=between('async function restoreConversation(','\nfunction scheduleSummary');
const adapterSource=between('voiceCall=attachVoiceCall(','\n\nafterimageBridge.connect(');
const noop=()=>{},packet={speech:'A complete spoken response.',emotion:'curious',action:'none',memory:''};

async function fixture(){
  const stored=new Map(),history=await createHistory({getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,String(value))});
  const nodes=new Map(),requests=[],spoken=[];let adapter,responder=async()=>Response.json(packet);
  function $(id){if(!nodes.has(id))nodes.set(id,{value:id==='reply-depth'?'balanced':'',lastChild:{textContent:''},focus:noop,scrollHeight:100,replaceChildren:noop});return nodes.get(id);}
  function addMessage(){const content={textContent:''};return {classList:{add:noop,remove:noop},querySelector:()=>content,append:noop,remove:noop};}
  const context=vm.createContext({
    $,history,normalizePacket,prepareChatRequest,explicitMemoryRequest,readChatStream,selfDeclaredName,historyFailure,spokenPreview,createReplyPresentation,observeInterface,AbortController,clearTimeout,setTimeout,
    composerOptions:{close:noop},composer:{setValue:value=>{$('message').value=value;},resize:noop},
    editTarget:null,currentActivity:'conversation',brain:'live',busy:false,mode:'companion',selectedProvider:'',
    summaryController:null,summaryTimer:null,pendingDraft:null,pendingPresentation:null,floatingPresence:null,document:{body:{dataset:{view:'conversation',presence:'visible'}}},activityTurn:null,lastPacket:{speech:'Before the call'},
    turns:createTurnGate(),activity:{beginTurn:()=>1,transition:noop,finishTurn:noop},
    replyDiagnostics:{begin:()=>1,complete:noop,setStatus:noop,invalidate:noop,clear:noop},
    afterimageBridge:{stop:noop},memory:{setName:noop,remember:noop},visit:{owner:false},
    approvedPreferences:{context:()=>({})},knowledge:{context:()=>[]},companionBridge:{propose:noop},
    applyApprovedPreferences:noop,apiHeaders:()=>({}),contextPreview:noop,updateMemory:noop,
    navigation:{render:noop},companionChanged:noop,messageCompanion:{clear:noop},
    voice:{enabled:true,supported:true,prepare:noop,speak:(text,_m,_e,_c,options)=>{spoken.push(text);options?.onPlaybackStart?.();},stop:noop,setEnabled:noop},
    microphone:{stop:noop},callMicrophone:{supported:true,start:noop,stop:noop},showVoice:noop,
    stage:{character:{react:noop},run:noop,speak:noop},addMessage,attachMessageActions:noop,
    scheduleSummary:noop,setUsage:noop,toast:noop,openSettings:noop,refreshConnection:noop,setMode:async()=>{},
    greetings:{companion:'Hello'},
    attachVoiceCall:configuration=>{adapter=configuration;return {session:{end:noop}};},
    async fetch(url,options){assert.equal(url,'/api/chat');requests.push(JSON.parse(options.body));return responder();},
  });
  context.setBusy=value=>{context.busy=value;};
  vm.runInContext(`${performSource}\n${cancelSource}\n${restoreSource}\n${sendSource}\n${adapterSource}`,context);
  return {history,context,$,adapter,requests,spoken,respondWith:fn=>{responder=fn;}};
}

test('call turns preserve downstream history while a pending edited draft is suspended and restored',async()=>{
  const ui=await fixture();
  for(const [role,content] of [['user','Original question'],['assistant','Original answer'],['user','Later question'],['assistant','Later answer']])await ui.history.append(role,content);
  ui.context.editTarget=1;ui.$('message').value='My unsent revision';
  const draft=ui.adapter.getDraft();assert.equal(ui.context.editTarget,null);
  const result=await ui.adapter.options.submit('A new spoken question');
  assert.equal(result.reply,packet.speech);assert.equal(result.voicePending,true);
  assert.deepEqual(ui.history.active().turns.map(turn=>turn.content),['Original question','Original answer','Later question','Later answer','A new spoken question',packet.speech]);
  ui.adapter.restoreDraft(draft);assert.equal(ui.$('message').value,'My unsent revision');assert.equal(ui.context.editTarget,1);
});

test('a call cannot restore an old edit into a different thread or overwrite a newer draft',async()=>{
  const ui=await fixture();await ui.history.append('user','Old thread');ui.context.editTarget=1;ui.$('message').value='Old edit';
  const draft=ui.adapter.getDraft();await ui.history.create();ui.$('message').value='';
  ui.adapter.restoreDraft(draft);assert.equal(ui.$('message').value,'');assert.equal(ui.context.editTarget,null);
  await ui.history.select(draft.thread);ui.$('message').value='A newer draft';ui.adapter.restoreDraft(draft);
  assert.equal(ui.$('message').value,'A newer draft');assert.equal(ui.context.editTarget,null);
});

test('a full conversation rejects call submission even though restoring it changes lastPacket identity',async()=>{
  const ui=await fixture();
  for(let index=0;index<100;index++){await ui.history.append('user',`Question ${index}`);await ui.history.append('assistant',`Answer ${index}`);}
  const previous=ui.context.lastPacket;
  await assert.rejects(ui.adapter.options.submit('One more spoken question'),/limit|could not/i);
  assert.notEqual(ui.context.lastPacket,previous,'restoring old chat is not proof of a newly completed answer');
  assert.equal(ui.history.active().turns.length,200);assert.equal(ui.requests.length,0);assert.equal(ui.spoken.length,0);
});

test('a response that loses its reserved archive slot cannot be mistaken for a completed call reply',async()=>{
  const ui=await fixture();
  for(let index=0;index<99;index++){await ui.history.append('user',`Question ${index}`);await ui.history.append('assistant',`Answer ${index}`);}
  ui.respondWith(async()=>{await ui.history.append('assistant','Another writer used the remaining slot');return Response.json(packet);});
  await assert.rejects(ui.adapter.options.submit('A spoken question'),/limit|could not/i);
  assert.equal(ui.history.active().turns.length,200);assert.equal(ui.history.active().turns.at(-1).content,'Another writer used the remaining slot');
  assert.equal(ui.spoken.length,0);
});

test('a failed spoken request does not discard the pre-call edited draft',async()=>{
  const ui=await fixture();await ui.history.append('user','Original question');await ui.history.append('assistant','Original answer');
  ui.context.editTarget=1;ui.$('message').value='My private unfinished edit';const draft=ui.adapter.getDraft();
  ui.respondWith(async()=>Response.json({error:'Network unavailable'},{status:503}));
  await assert.rejects(ui.adapter.options.submit('Failed spoken question'));
  ui.adapter.restoreDraft(draft);
  assert.equal(ui.$('message').value,'My private unfinished edit');assert.equal(ui.context.editTarget,1);
  assert.equal(ui.history.active().turns.at(-1).content,'Failed spoken question');
});

test('busy and disconnected call submissions reject without inventing speech or sending a request',async()=>{
  const ui=await fixture();ui.context.busy=true;
  await assert.rejects(ui.adapter.options.submit('While busy'),/finishing/);
  ui.context.busy=false;ui.context.brain='loading';await assert.rejects(ui.adapter.options.submit('While disconnected'));
  assert.equal(ui.requests.length,0);assert.equal(ui.spoken.length,0);
});

class Element extends EventTarget{
  constructor(){super();this.children=[];this.dataset={};this.open=false;}
  append(node){node.parentNode?.remove(node);this.children.push(node);node.parentNode=this;}
  remove(node){this.children=this.children.filter(child=>child!==node);node.parentNode=null;}
  insertBefore(node,before){this.children.splice(this.children.indexOf(before),0,node);node.parentNode=this;}
  replaceWith(node){const parent=this.parentNode;if(!parent)return;node.parentNode?.remove(node);parent.children.splice(parent.children.indexOf(this),1,node);node.parentNode=parent;this.parentNode=null;}
  setAttribute(){}focus(){}showModal(){this.open=true;}
  close(){this.open=false;queueMicrotask(()=>this.dispatchEvent(new Event('close')));}
}

test('native dialog closure restores the same stage and stops the call after the open attribute is cleared',async()=>{
  const oldWindow=globalThis.window,oldLocation=globalThis.location;
  globalThis.window=new EventTarget();globalThis.location={hash:'#conversation'};
  const ids=['voice-call-dialog','stage-bezel','voice-call-presence','call-button','voice-call-status','voice-call-heard','voice-call-connect','voice-call-mute','voice-call-interrupt','voice-call-type','voice-call-end','voice-call-close','message'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()])),home=new Element(),doc=new Element(),stops=[];home.append(nodes['stage-bezel']);
  doc.body={dataset:{}};doc.getElementById=id=>nodes[id];doc.createComment=()=>new Element();
  const ui=attachVoiceCall({documentTarget:doc,options:{supported:true,startListening:noop,stopListening:()=>stops.push('microphone'),stopReply:()=>stops.push('reply')}});
  try{
    ui.session.open();assert.equal(nodes['stage-bezel'].parentNode,nodes['voice-call-presence']);
    nodes['voice-call-dialog'].close();await new Promise(resolve=>queueMicrotask(resolve));
    assert.equal(ui.session.snapshot().open,false);assert.equal(doc.body.dataset.callOpen,'false');assert.equal(nodes['stage-bezel'].parentNode,home);
    assert.ok(stops.includes('microphone'));assert.ok(stops.includes('reply'));
  }finally{
    ui.dispose();await new Promise(resolve=>queueMicrotask(resolve));
    if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;
    if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;
  }
});
