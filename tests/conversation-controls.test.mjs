import test from 'node:test';
import assert from 'node:assert/strict';
import {createComposerSizer,createReplyDiagnostics} from '../public/js/conversation-controls.js';

function diagnosticElements(){
  return {
    status:{textContent:'',dataset:{}},
    metrics:{textContent:'',dataset:{},hidden:false},
    toggle:Object.assign(new EventTarget(),{checked:true}),
  };
}

test('successful reply timings stay hidden until developer mode is enabled',()=>{
  const elements=diagnosticElements(),diagnostics=createReplyDiagnostics(elements);
  const token=diagnostics.begin('NOX is thinking…');
  diagnostics.complete(token,{firstTextMs:120,totalMs:480,provider:'groq',model:'example',depth:'quick'});
  assert.equal(elements.status.textContent,'');
  assert.equal(elements.metrics.hidden,true);
  assert.equal(elements.toggle.checked,false);
  assert.match(elements.metrics.textContent,/120 ms.*480 ms.*groq/);
  assert.equal(elements.metrics.dataset.model,'example');
  elements.toggle.checked=true;elements.toggle.dispatchEvent(new Event('change'));
  assert.equal(elements.metrics.hidden,false);
  elements.toggle.checked=false;elements.toggle.dispatchEvent(new Event('change'));
  assert.equal(elements.metrics.hidden,true);
});

test('thinking, stopped, and error statuses stay visible regardless of developer mode',()=>{
  const elements=diagnosticElements(),diagnostics=createReplyDiagnostics(elements);
  diagnostics.begin('NOX is thinking…');
  assert.equal(elements.status.textContent,'NOX is thinking…');
  diagnostics.setStatus('Reply stopped. Your sent message is saved.');
  assert.match(elements.status.textContent,/stopped/);
  diagnostics.setStatus('Reply interrupted. Your sent message is saved.');
  elements.toggle.checked=true;elements.toggle.dispatchEvent(new Event('change'));
  elements.toggle.checked=false;elements.toggle.dispatchEvent(new Event('change'));
  assert.match(elements.status.textContent,/interrupted/);
  assert.equal(elements.metrics.hidden,true);
});

test('late voice metrics cannot attach to a later turn or a stopped reply',()=>{
  const elements=diagnosticElements(),diagnostics=createReplyDiagnostics(elements);
  const first=diagnostics.begin('Thinking');
  diagnostics.complete(first,{firstTextMs:null,totalMs:500,provider:'groq'});
  const pendingVoice=diagnostics.capture();
  const second=diagnostics.begin('Thinking again');
  diagnostics.complete(second,{firstTextMs:80,totalMs:230,provider:'gemini'});
  diagnostics.voice(pendingVoice,999,'miss');
  assert.match(elements.metrics.textContent,/gemini/);
  assert.doesNotMatch(elements.metrics.textContent,/voice|999|groq/);
  diagnostics.voice(diagnostics.capture(),90,'hit');
  assert.match(elements.metrics.textContent,/voice 90 ms/);
  assert.equal(elements.metrics.dataset.audioCache,'hit');
  diagnostics.invalidate();
  diagnostics.voice(second,150,'miss');
  assert.doesNotMatch(elements.metrics.textContent,/150/);
  diagnostics.clear();
  assert.equal(elements.metrics.textContent,'');
  assert.equal(elements.metrics.dataset.audioCache,undefined);
});

function textarea(){
  const element=Object.assign(new EventTarget(),{value:'',style:{},measuredHeight:42});
  Object.defineProperty(element,'scrollHeight',{get(){return element.measuredHeight;}});
  return element;
}

test('composer grows with typing, caps its height, and shrinks after send',()=>{
  const message=textarea(),windowTarget=new EventTarget();
  const composer=createComposerSizer(message,{windowTarget,readStyle:()=>({minHeight:'42px',maxHeight:'140px'})});
  assert.equal(message.style.height,'42px');
  message.value='A longer thought';message.measuredHeight=94;message.dispatchEvent(new Event('input'));
  assert.equal(message.style.height,'94px');
  assert.equal(message.style.overflowY,'hidden');
  message.measuredHeight=210;message.dispatchEvent(new Event('input'));
  assert.equal(message.style.height,'140px');
  assert.equal(message.style.overflowY,'auto');
  composer.setValue('');
  assert.equal(message.style.height,'42px');
  assert.equal(message.style.overflowY,'hidden');
});

test('restored messages and dictation resize immediately and CSS can adjust the cap',()=>{
  const message=textarea(),windowTarget=new EventTarget();
  const composer=createComposerSizer(message,{windowTarget,readStyle:()=>({minHeight:'42px',maxHeight:'110px',borderTopWidth:'1px',borderBottomWidth:'1px'})});
  message.measuredHeight=88;composer.setValue('Restored after an error');
  assert.equal(message.style.height,'90px');
  message.measuredHeight=170;composer.setValue('A dictated message');
  assert.equal(message.style.height,'110px');
  message.measuredHeight=64;windowTarget.dispatchEvent(new Event('resize'));
  assert.equal(message.style.height,'66px');
  message.measuredHeight=74;composer.resize();
  assert.equal(message.style.height,'76px');
});

test('keyboard viewport changes recalculate the height and scrolling cap without a window resize',()=>{
  const message=textarea(),windowTarget=new EventTarget(),viewport=new EventTarget();let cap=140;
  const composer=createComposerSizer(message,{windowTarget,viewport,readStyle:()=>({minHeight:'42px',maxHeight:`${cap}px`})});
  message.measuredHeight=120;composer.setValue('A multiline draft written before the keyboard opens');
  assert.equal(message.style.height,'120px');assert.equal(message.style.overflowY,'hidden');
  cap=76;viewport.dispatchEvent(new Event('resize'));
  assert.equal(message.style.height,'76px');assert.equal(message.style.overflowY,'auto');
  cap=140;viewport.dispatchEvent(new Event('resize'));
  assert.equal(message.style.height,'120px');assert.equal(message.style.overflowY,'hidden');
});
