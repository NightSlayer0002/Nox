import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {normalizePacket} from '../shared/character.js';
import {spokenPreview} from '../public/js/reply.js';
import {createReplyPresentation} from '../public/js/reply-presentation.js';
import {setChatContent} from '../public/js/chat-message.js';
import {createTurnGate} from '../public/js/turns.js';
import {createVoice} from '../public/js/voice.js';
import {createVoiceCall} from '../public/js/voice-call.js';
import {messageDocument} from './helpers/message-dom.mjs';

const source=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
const performSource=source.slice(source.indexOf('async function perform('),source.indexOf('\nfunction setBusy('));
const cancelSource=source.slice(source.indexOf('function cancelConversation()'),source.indexOf('\nasync function restoreConversation'));
const noop=()=>{},packet={speech:'The complete valid written answer remains readable when audio fails.',emotion:'curious',action:'none',memory:''};

for(const failure of ['provider','autoplay'])test(`a call ${failure} failure preserves the completed written reply`,async()=>{
  const saved=[],nodes=new Map(),text=messageDocument().createElement('div'),turns=createTurnGate();
  const draft={removed:false,classList:{remove:noop},querySelector:()=>text,remove(){this.removed=true;}};
  let call,context;
  const voice=createVoice({
    requestAudio:async()=>{if(failure==='provider')throw Error('Speech quota exhausted.');return new Blob(['audio'],{type:'audio/mpeg'});},
    AudioCtor:class{play(){return Promise.reject(Error('Autoplay blocked.'));}pause(){}},
    AudioContextCtor:null,urls:{createObjectURL:()=> 'blob:test',revokeObjectURL:noop},
    onState:state=>call?.onVoiceState(state),onEnd:()=>call?.onVoiceEnd(),onError:message=>call?.fail(message),
  });
  voice.configureNatural(true);voice.setEngine('natural');voice.setEnabled(true);
  context=vm.createContext({normalizePacket,spokenPreview,createReplyPresentation,setChatContent,turns,voice,setTimeout,clearTimeout,
    replyFollow:{update:change=>change()},
    pendingPresentation:null,pendingDraft:null,summaryController:null,summaryTimer:null,activityTurn:null,lastPacket:null,mode:'companion',
    replyDiagnostics:{setStatus:noop,invalidate:noop},afterimageBridge:{stop:noop},activity:{finishTurn:noop},setBusy:noop,microphone:{stop:noop},
    history:{append:async(role,content)=>{saved.push({role,content});return true;},active:()=>({turns:saved})},
    stage:{speak:noop,canvas:{scrollIntoView:noop}},memory:{remember:noop},
    $:id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,textContent:''});return nodes.get(id);},
    attachMessageActions:noop,updateMemory:noop,navigation:{render:noop},companionChanged:noop,
    matchMedia:()=>({matches:false}),floatingPresence:{active:true},
  });
  vm.runInContext(`${performSource}\n${cancelSource}`,context);
  call=createVoiceCall({supported:true,startListening:()=>call.onListening(true),stopListening:noop,
    stopReply:()=>context.cancelConversation(),
    async submit(){
      const version=turns.begin();context.pendingDraft=draft;
      const completed=await context.perform(packet,true,draft,version,'balanced');
      if(!turns.isCurrent(version))return;
      context.pendingDraft=null;
      return {reply:completed.speech,voicePending:voice.enabled&&voice.supported};
    },
  });
  try{
    call.open();call.connect();call.onTranscript('A question with a valid answer.');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(call.snapshot().status,'error');
    assert.equal(saved[0]?.content,packet.speech,'audio failure must retain the complete written answer');
    assert.equal(text.textContent,packet.speech,'audio failure must release the text presentation gate');
    assert.equal(draft.removed,false,'voice call cleanup must not remove a completed written reply');
  }finally{call.dispose();}
});
