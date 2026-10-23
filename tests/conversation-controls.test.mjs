import test from 'node:test';
import assert from 'node:assert/strict';
import {attachComposerOptions,createComposerSizer,createReplyDiagnostics} from '../public/js/conversation-controls.js';

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

test('audible startup diagnostics ignore stale turns and reset for the next reply',()=>{
  const elements=diagnosticElements(),diagnostics=createReplyDiagnostics(elements);
  const first=diagnostics.begin();diagnostics.playback(first,{status:'speaking',totalMs:321,preparationMs:300});
  assert.equal(elements.metrics.dataset.voiceStartMs,'321');
  const next=diagnostics.begin();diagnostics.playback(first,{status:'speaking',totalMs:999});
  assert.equal(elements.metrics.dataset.voiceStartMs,undefined);
  diagnostics.playback(next,{status:'speaking',totalMs:100,preparationMs:80});assert.match(elements.metrics.textContent,/speech starts 100 ms/);
  diagnostics.clear();assert.equal(elements.metrics.dataset.voiceStartMs,undefined);
});

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

test('composer expansion follows measured lines and returns to the tube when a draft shrinks',()=>{
  const message=textarea();message.form={dataset:{}};message.measuredHeight=32;
  const composer=createComposerSizer(message,{windowTarget:new EventTarget(),readStyle:()=>({minHeight:'32px',maxHeight:'120px'})});
  assert.equal(message.form.dataset.expanded,'false');
  composer.setValue('One line');
  assert.equal(message.form.dataset.expanded,'false');
  message.measuredHeight=88;message.dispatchEvent(new Event('input'));
  assert.equal(message.form.dataset.expanded,'true');
  message.measuredHeight=32;message.dispatchEvent(new Event('input'));
  assert.equal(message.form.dataset.expanded,'false');
  message.measuredHeight=240;message.dispatchEvent(new Event('input'));
  assert.equal(message.style.height,'120px');
  assert.equal(message.form.dataset.expanded,'true');
  composer.setValue('');
  assert.equal(message.form.dataset.expanded,'false');
});

function composerOptionsElements(){
  const documentTarget=new EventTarget(),windowTarget=new EventTarget(),form=new EventTarget();
  const summary=new EventTarget(),depth=new EventTarget(),notes=new EventTarget();
  const message=new EventTarget();documentTarget.activeElement=message;
  summary.focus=()=>{documentTarget.activeElement=summary;};
  const details=Object.assign(new EventTarget(),{
    open:false,
    contains:target=>[details,summary,depth,notes].includes(target),
    closest:selector=>selector==='form'?form:null,
    querySelector:selector=>({summary,'#reply-depth':depth,'#knowledge-chat-button':notes}[selector]||null),
  });
  return {details,summary,depth,notes,form,message,documentTarget,windowTarget};
}

function attachOptions(elements){
  const {documentTarget,windowTarget}=elements;
  return attachComposerOptions(elements.details,{documentTarget,windowTarget});
}

function dispatchAt(target,type,properties={}){
  const event=new Event(type,{cancelable:true});
  for(const [key,value] of Object.entries(properties))Object.defineProperty(event,key,{value});
  target.dispatchEvent(event);
  return event;
}

test('composer options stay open for internal controls and close on an outside pointer without moving focus',()=>{
  const elements=composerOptionsElements();attachOptions(elements);elements.details.open=true;
  for(const target of [elements.summary,elements.depth,elements.notes]){
    dispatchAt(elements.documentTarget,'pointerdown',{target});
    assert.equal(elements.details.open,true);
  }
  dispatchAt(elements.documentTarget,'pointerdown',{target:elements.message});
  assert.equal(elements.details.open,false);
  assert.equal(elements.documentTarget.activeElement,elements.message);
});

test('Escape closes open composer options and returns focus to their summary',()=>{
  const elements=composerOptionsElements();attachOptions(elements);elements.details.open=true;
  const event=dispatchAt(elements.windowTarget,'keydown',{key:'Escape'});
  assert.equal(elements.details.open,false);
  assert.equal(elements.documentTarget.activeElement,elements.summary);
  assert.equal(event.defaultPrevented,true);
});

test('closed composer options do not intercept Escape or take focus from typing',()=>{
  const elements=composerOptionsElements();attachOptions(elements);
  const event=dispatchAt(elements.windowTarget,'keydown',{key:'Escape'});
  assert.equal(elements.details.open,false);
  assert.equal(elements.documentTarget.activeElement,elements.message);
  assert.equal(event.defaultPrevented,false);
});

test('answer depth changes stay open so keyboard users can reach every option',()=>{
  const elements=composerOptionsElements();attachOptions(elements);elements.details.open=true;
  elements.documentTarget.activeElement=elements.depth;
  for(let selection=0;selection<2;selection++)dispatchAt(elements.depth,'change');
  assert.equal(elements.details.open,true);
  assert.equal(elements.documentTarget.activeElement,elements.depth);
});

test('notes closes options with a visible focus target for the modal to restore',()=>{
  const elements=composerOptionsElements();attachOptions(elements);elements.details.open=true;
  elements.documentTarget.activeElement=elements.notes;dispatchAt(elements.notes,'click');
  assert.equal(elements.details.open,false);
  assert.equal(elements.documentTarget.activeElement,elements.summary);
});

test('form submission closes composer options without stealing focus',()=>{
  const elements=composerOptionsElements();attachOptions(elements);
  elements.details.open=true;dispatchAt(elements.form,'submit');
  assert.equal(elements.details.open,false);
  assert.equal(elements.documentTarget.activeElement,elements.message);
});

test('composer options expose a close hook without changing native summary keyboard behavior',()=>{
  const elements=composerOptionsElements(),options=attachOptions(elements);elements.details.open=true;
  for(const key of ['Enter',' ']){
    const event=dispatchAt(elements.windowTarget,'keydown',{key});
    assert.equal(event.defaultPrevented,false);
    assert.equal(elements.details.open,true);
  }
  options.close();
  assert.equal(elements.details.open,false);
  assert.equal(elements.documentTarget.activeElement,elements.message);
});
