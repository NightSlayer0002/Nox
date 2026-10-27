import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {normalizePacket} from '../shared/character.js';
import {spokenPreview} from '../public/js/reply.js';
import {createReplyPresentation} from '../public/js/reply-presentation.js';
import {setChatContent} from '../public/js/chat-message.js';
const source=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('async function perform('),source.indexOf('\nfunction setBusy('));
const noop=()=>{},packet={speech:'A complete opening. '+ 'The full written answer remains available. '.repeat(20).trimEnd(),emotion:'curious',action:'gravity',memory:''};
function fixture(enabled=true){
  const text={textContent:''},draft={classList:{remove:noop},querySelector:()=>text},saved=[],stageEvents=[],nodes=new Map();let callbacks,current=true;
  const context=vm.createContext({normalizePacket,spokenPreview,createReplyPresentation,setChatContent,setTimeout,clearTimeout,
    pendingPresentation:null,pendingDraft:draft,replyDiagnostics:{setStatus:noop,capture:()=>1},
    turns:{isCurrent:()=>current},lastPacket:null,mode:'companion',
    voice:{enabled,supported:true,prepare:noop,stop:noop,speak:(_t,_m,_e,_c,options)=>{callbacks=options;return Promise.resolve();}},
    history:{append:async(role,content)=>{saved.push({role,content});return true;},active:()=>({turns:[{role:'assistant',content:packet.speech}]})},
    stage:{speak:value=>stageEvents.push(value),canvas:{scrollIntoView:noop}},memory:{remember:noop},
    $:id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,textContent:''});return nodes.get(id);},
    attachMessageActions:noop,updateMemory:noop,navigation:{render:noop},companionChanged:noop,
    replyFollow:{update:change=>change()},
    matchMedia:()=>({matches:false}),floatingPresence:{active:true},
  });vm.runInContext(body,context);
  return {context,text,draft,saved,stageEvents,callbacks:()=>callbacks,stale:()=>{current=false;},start:()=>context.perform(packet,true,draft,1,'balanced')};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('voice-enabled reply persists in full but stays out of chat until playback starts',async()=>{
  const f=fixture(),work=f.start();await tick();
  assert.equal(f.saved[0].content,packet.speech);assert.equal(f.text.textContent,'');assert.equal(f.stageEvents.length,0);
  f.callbacks().onPlaybackStart();await work;
  assert.equal(f.text.textContent,packet.speech);assert.equal(f.stageEvents.length,1);assert.ok(f.stageEvents[0].speech.length<=420);
});
test('voice-off reply appears immediately',async()=>{
  const f=fixture(false);await f.start();assert.equal(f.text.textContent,packet.speech);assert.equal(f.stageEvents.length,1);
});
test('unavailable audio and Show text now both release the same complete answer',async()=>{
  for(const reason of ['unavailable','requested']){
    const f=fixture(),work=f.start();await tick();assert.equal(f.text.textContent,'');
    if(reason==='unavailable')f.callbacks().onPlaybackUnavailable();else f.context.pendingPresentation.reveal('requested');
    await work;assert.equal(f.text.textContent,packet.speech);assert.equal(f.stageEvents.length,1);
    f.callbacks().onPlaybackStart();assert.equal(f.stageEvents.length,1);
  }
});
test('superseded speech cannot reveal a stale reply',async()=>{
  const f=fixture(),work=f.start();await tick();f.stale();f.context.pendingPresentation.cancel();f.callbacks().onPlaybackStart();await work;
  assert.equal(f.text.textContent,'');assert.equal(f.stageEvents.length,0);
});
