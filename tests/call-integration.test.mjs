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
import {setChatContent} from '../public/js/chat-message.js';
import {observeInterface} from '../public/js/interface-observation.js';
import {attachVoiceCall} from '../public/js/voice-call-controls.js';
import {messageDocument} from './helpers/message-dom.mjs';

const source=(await readFile(new URL('../public/js/app.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
function between(start,end){const first=source.indexOf(start),last=source.indexOf(end,first);assert.ok(first>=0&&last>first);return source.slice(first,last);}
const sendSource=between('async function send(','\nconst greetings =');
const performSource=between('async function perform(','\nfunction setBusy(');
const cancelSource=between('function cancelConversation()','\nasync function restoreConversation');
const restoreSource=between('async function restoreConversation(','\nfunction scheduleSummary');
const modeSource=between('async function setMode(',"\ndocument.querySelectorAll('[data-mode]')");
const newSource=between('async function newConversation(','\nnavigation=createNavigation(');
const navigationSource=between('navigation=createNavigation(','\nmessageCompanion=');
const adapterSource=between('voiceCall=attachVoiceCall(','\n\nafterimageBridge.connect(');
const noop=()=>{},packet={speech:'A complete spoken response.',emotion:'curious',action:'none',memory:''};

async function fixture(){
  const stored=new Map(),history=await createHistory({getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,String(value))});
  const nodes=new Map(),requests=[],spoken=[];let adapter,responder=async()=>Response.json(packet);
  function $(id){if(!nodes.has(id))nodes.set(id,{value:id==='reply-depth'?'balanced':'',lastChild:{textContent:''},focus:noop,scrollHeight:100,replaceChildren:noop});return nodes.get(id);}
  function addMessage(){const content=messageDocument().createElement('div');return {classList:{add:noop,remove:noop},querySelector:()=>content,append:noop,remove:noop};}
  const context=vm.createContext({
    $,history,normalizePacket,prepareChatRequest,explicitMemoryRequest,readChatStream,selfDeclaredName,historyFailure,spokenPreview,createReplyPresentation,setChatContent,observeInterface,AbortController,clearTimeout,setTimeout,
    replyFollow:{update:change=>change(),latest:()=>{}},
    composerOptions:{close:noop},composer:{setValue:value=>{$('message').value=value;},resize:noop},
    editTarget:null,currentActivity:'conversation',brain:'live',busy:false,mode:'companion',selectedProvider:'',
    summaryController:null,summaryTimer:null,pendingDraft:null,pendingPresentation:null,floatingPresence:null,document:{body:{dataset:{view:'conversation',presence:'visible'}},querySelectorAll:()=>[]},activityTurn:null,lastPacket:{speech:'Before the call'},
    turns:createTurnGate(),activity:{beginTurn:()=>1,transition:noop,finishTurn:noop},
    replyDiagnostics:{begin:()=>1,complete:noop,setStatus:noop,invalidate:noop,clear:noop},
    afterimageBridge:{stop:noop},memory:{setName:noop,remember:noop,setMode:async()=>true},visit:{owner:false},
    approvedPreferences:{context:()=>({})},knowledge:{context:()=>[]},companionBridge:{propose:noop},
    applyApprovedPreferences:noop,apiHeaders:()=>({}),contextPreview:noop,updateMemory:noop,
    navigation:{render:noop},companionChanged:noop,messageCompanion:{clear:noop},
    voice:{enabled:true,supported:true,prepare:noop,speak:(text,_m,_e,_c,options)=>{spoken.push(text);options?.onPlaybackStart?.();},stop:noop,setEnabled:noop},
    microphone:{stop:noop},callMicrophone:{supported:true,start:noop,stop:noop},showVoice:noop,
    stage:{character:{react:noop},run:noop,speak:noop,setMode:noop},addMessage,attachMessageActions:noop,
    scheduleSummary:noop,setUsage:noop,toast:noop,openSettings:noop,refreshConnection:noop,
    greetings:{companion:'Hello'},
    attachVoiceCall:configuration=>{adapter=configuration;return {session:{end:noop}};},
    createNavigation:hooks=>{context.navigationHooks=hooks;return {render:noop};},
    async fetch(url,options){assert.equal(url,'/api/chat');requests.push(JSON.parse(options.body));return responder();},
  });
  context.setBusy=value=>{context.busy=value;};
  vm.runInContext(`${modeSource}\n${performSource}\n${cancelSource}\n${restoreSource}\n${newSource}\n${sendSource}\n${adapterSource}\n${navigationSource}`,context);
  return {history,context,$,adapter,requests,spoken,respondWith:fn=>{responder=fn;}};
}

test('call turns preserve downstream history while a pending edited draft is suspended and restored',async()=>{
  const ui=await fixture();
  for(const [role,content] of [['user','Original question'],['assistant','Original answer'],['user','Later question'],['assistant','Later answer']])await ui.history.append(role,content);
  ui.context.editTarget=ui.history.revisionTarget(1);ui.$('message').value='My unsent revision';
  const draft=ui.adapter.getDraft();assert.equal(ui.context.editTarget,null);
  const result=await ui.adapter.options.submit('A new spoken question');
  assert.equal(result.reply,packet.speech);assert.equal(result.voicePending,true);
  assert.deepEqual(ui.history.active().turns.map(turn=>turn.content),['Original question','Original answer','Later question','Later answer','A new spoken question',packet.speech]);
  ui.adapter.restoreDraft(draft);assert.equal(ui.$('message').value,'My unsent revision');assert.deepEqual(ui.context.editTarget,draft.edit);
});

test('a call cannot restore an old edit into a different thread or overwrite a newer draft',async()=>{
  const ui=await fixture();await ui.history.append('user','Old thread');ui.context.editTarget=ui.history.revisionTarget(1);ui.$('message').value='Old edit';
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
  ui.context.editTarget=ui.history.revisionTarget(1);ui.$('message').value='My private unfinished edit';const draft=ui.adapter.getDraft();
  ui.respondWith(async()=>Response.json({error:'Network unavailable'},{status:503}));
  await assert.rejects(ui.adapter.options.submit('Failed spoken question'));
  ui.adapter.restoreDraft(draft);
  assert.equal(ui.$('message').value,'My private unfinished edit');assert.deepEqual(ui.context.editTarget,draft.edit);
  assert.equal(ui.history.active().turns.at(-1).content,'Failed spoken question');
});

test('busy and disconnected call submissions reject without inventing speech or sending a request',async()=>{
  const ui=await fixture();ui.context.busy=true;
  await assert.rejects(ui.adapter.options.submit('While busy'),/finishing/);
  ui.context.busy=false;ui.context.brain='loading';await assert.rejects(ui.adapter.options.submit('While disconnected'));
  assert.equal(ui.requests.length,0);assert.equal(ui.spoken.length,0);
});

test('call answers retain complete readable text while audio remains a bounded preview',async()=>{
  const ui=await fixture(),speech='A complete explanation. '.repeat(60)+'The final decision belongs in the call too.';
  ui.respondWith(async()=>Response.json({...packet,speech}));
  const result=await ui.adapter.options.submit('A long spoken question');
  assert.equal(result.reply,speech);assert.ok(ui.spoken[0].length<=420);
});

for(const failed of [false,true])test(`a newer typed draft survives a pending history append and ${failed?'failed':'successful'} reply`,async()=>{
  const ui=await fixture();ui.$('message').value='Submitted thought';
  let release,started;const gate=new Promise(resolve=>{release=resolve;}),waiting=new Promise(resolve=>{started=resolve;});
  const append=ui.history.append.bind(ui.history);
  ui.history.append=async(role,...args)=>{if(role==='user'){started();await gate;}return append(role,...args);};
  if(failed)ui.respondWith(async()=>Response.json({error:'Synthetic unavailable reply'},{status:503}));
  const work=ui.context.send('Submitted thought',{source:'composer'});await waiting;
  ui.$('message').value='A newer unfinished thought';release();await work;
  assert.equal(ui.$('message').value,'A newer unfinished thought');
  assert.equal(ui.history.active().turns[0].content,'Submitted thought');
});

test('the unchanged submitted draft still clears after it is recorded',async()=>{
  const ui=await fixture();ui.$('message').value='Submitted thought';
  await ui.context.send('Submitted thought',{source:'composer'});assert.equal(ui.$('message').value,'');
});

// Uncertainty: does an out-of-composer send own or erase the current draft/edit?
// Boundary: real send/history with synthetic HTTP and DOM. No real browser,
// provider quality, microphone or durable physical-disk guarantees are established.
for(const failed of [false,true])test(`an activity prompt preserves an unrelated draft after a ${failed?'failed':'successful'} reply`,async()=>{
  const ui=await fixture();ui.$('message').value='An unrelated unfinished idea';
  if(failed)ui.respondWith(async()=>Response.json({error:'Synthetic unavailable reply'},{status:503}));
  await ui.context.send('Explain this activity');
  assert.equal(ui.$('message').value,'An unrelated unfinished idea');
  assert.equal(ui.requests[0].message,'Explain this activity');
});

test('a programmatic request appends without submitting an unfinished edit',async()=>{
  const ui=await fixture();await ui.history.append('user','Original question');await ui.history.append('assistant','Original answer');
  const target=ui.history.revisionTarget(1);ui.context.editTarget=target;ui.$('message').value='An unfinished correction';
  await ui.context.send('A separate activity question');
  assert.deepEqual(ui.history.active().turns.map(turn=>turn.content),['Original question','Original answer','A separate activity question',packet.speech]);
  assert.equal(ui.$('message').value,'An unfinished correction');assert.equal(ui.context.editTarget,target);
});

test('a failed programmatic request does not put its activity prompt into an empty composer',async()=>{
  const ui=await fixture();ui.respondWith(async()=>Response.json({error:'Synthetic unavailable reply'},{status:503}));
  await ui.context.send('A separate activity question');assert.equal(ui.$('message').value,'');
  assert.equal(ui.history.active().turns[0].content,'A separate activity question');
});

test('a navigation start prompt preserves the composer draft through mode restoration',async()=>{
  const ui=await fixture();ui.$('message').value='An independent typed thought';
  await ui.context.navigationHooks.onStart('A started conversation','companion');
  assert.equal(ui.$('message').value,'An independent typed thought');assert.equal(ui.requests[0].message,'A started conversation');
});

test('a read-only owner cannot bypass saving by resending an already recorded unanswered turn',async()=>{
  // Uncertainty: can recorded=true bypass the write-capability guard and spend
  // a request whose answer cannot be saved? Real send/history, synthetic HTTP;
  // this does not measure deployed spend or all storage-failure conditions.
  const ui=await fixture();await ui.history.append('user','Saved unanswered question');
  ui.context.visit.owner=true;ui.context.memory.snapshot=()=>({});ui.context.history=new Proxy(ui.history,{get:(target,key)=>key==='crossTabSafe'?false:key==='append'?async()=>false:Reflect.get(target,key)});
  ui.$('message').value='Saved unanswered question';await ui.context.send('Saved unanswered question',{source:'composer'});
  assert.equal(ui.requests.length,0);assert.equal(ui.$('message').value,'Saved unanswered question');assert.equal(ui.history.active().turns.length,1);
});

test('reply completion preserves the focus the reader chose while the request was pending',async()=>{
  // Uncertainty: does completion steal focus back to the composer? Controlled
  // send/fetch fixture; actual keyboard focus is checked in the browser journey.
  const ui=await fixture();let focus='composer',release,entered;
  ui.$('message').focus=()=>{focus='composer';};
  const started=new Promise(resolve=>{entered=resolve;});ui.respondWith(()=>new Promise(resolve=>{release=()=>resolve(Response.json(packet));entered();}));
  const work=ui.context.send('A submitted thought',{source:'composer'});await started;
  focus='reading';release();await work;assert.equal(focus,'reading');
});

test('a rejected edit keeps its target and draft without issuing a model request',async()=>{
  const ui=await fixture();await ui.history.append('user','Original question');await ui.history.append('assistant','Original answer');
  const original=ui.history.active();ui.context.editTarget=ui.history.revisionTarget(1);ui.$('message').value='My corrected question';
  ui.history.replaceFrom=async()=>null;
  await ui.context.send('My corrected question',{source:'composer'});
  assert.deepEqual(ui.context.editTarget,ui.history.revisionTarget(1));assert.equal(ui.$('message').value,'My corrected question');assert.deepEqual(ui.history.active(),original);assert.equal(ui.requests.length,0);
});

for(const switchThread of [false,true])test(`a revision canceled during mode restoration cannot send into ${switchThread?'another thread':'the canceled thread'}`,async()=>{
  const ui=await fixture();await ui.history.append('user','Original question');await ui.history.append('assistant','Original answer');
  ui.context.editTarget=ui.history.revisionTarget(1);ui.$('message').value='Corrected question';
  let release,entered;const blocked=new Promise(resolve=>{release=resolve;}),restoring=new Promise(resolve=>{entered=resolve;});
  ui.context.memory.setMode=async()=>{entered();await blocked;return true;};
  const sending=ui.context.send('Corrected question',{source:'composer'});await restoring;
  ui.context.cancelConversation();if(switchThread)await ui.history.create();
  release();await sending;
  assert.equal(ui.requests.length,0);assert.equal(ui.spoken.length,0);
  assert.equal(ui.history.active().turns.some(turn=>turn.role==='assistant'),false);
});

test('a start prompt canceled during mode restoration cannot launch a new request',async()=>{
  const ui=await fixture();let release,entered;const blocked=new Promise(resolve=>{release=resolve;}),restoring=new Promise(resolve=>{entered=resolve;});
  ui.context.memory.setMode=async()=>{entered();await blocked;return true;};
  const starting=ui.context.navigationHooks.onStart('An obsolete start prompt','companion');await restoring;
  ui.context.cancelConversation();release();await starting;assert.equal(ui.requests.length,0);
});

for(const phase of ['create','restore'])test(`a new conversation canceled during ${phase} does not report a successful start`,async()=>{
  const ui=await fixture();let release,entered;const blocked=new Promise(resolve=>{release=resolve;}),waiting=new Promise(resolve=>{entered=resolve;});
  if(phase==='create'){const create=ui.history.create.bind(ui.history);ui.history.create=async()=>{const result=await create();entered();await blocked;return result;};}
  else ui.context.memory.setMode=async()=>{entered();await blocked;return true;};
  const starting=ui.context.newConversation();await waiting;ui.context.cancelConversation();release();
  assert.equal(await starting,false);assert.equal(ui.requests.length,0);
});

test('an older chat-open continuation cannot cancel a newer conversation start',async()=>{
  const ui=await fixture();await ui.history.append('user','Earlier question');await ui.history.append('assistant','Earlier answer');
  const earlier=ui.history.active().id;await ui.history.create();await ui.history.append('user','Another question');
  const opening=ui.context.navigationHooks.onOpen(earlier),starting=ui.context.newConversation();
  await opening;assert.equal(await starting,true);assert.notEqual(ui.history.active().id,earlier);
  assert.equal(ui.history.active().turns.length,0);assert.equal(ui.requests.length,0);
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
  const ids=['voice-call-dialog','stage-bezel','voice-call-presence','call-button','voice-call-status','voice-call-heard','voice-call-answer','voice-call-reply','voice-call-connect','voice-call-mute','voice-call-interrupt','voice-call-type','voice-call-end','voice-call-close','message'];
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
