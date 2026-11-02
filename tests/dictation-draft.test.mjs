import test from 'node:test';
import assert from 'node:assert/strict';
import {attachComposerSubmission} from '../public/js/composer-submission.js';

let createDictationDraft;
const helperUrl=new URL('../public/js/dictation-draft.js',import.meta.url);
try{({createDictationDraft}=await import(helperUrl));}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND'||error.url!==helperUrl.href)throw error;}
function fixture({text='',start=text.length,end=start,maxLength=6000}={}){
  assert.equal(typeof createDictationDraft,'function','Reviewed dictation must be implemented.');
  const input=new EventTarget(),form=new EventTarget(),notices=[],sent=[],state={thread:'first-thread',editable:true};
  Object.assign(input,{value:text,selectionStart:start,selectionEnd:end,maxLength,focus(){this.focused=true;},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}});
  const draft=createDictationDraft({input,getThread:()=>state.thread,canInsert:()=>state.editable,onNotice:message=>notices.push(message)});
  const release=attachComposerSubmission({input,form,onSend:value=>sent.push(value)});
  return {input,form,state,notices,sent,draft,cleanup(){release();draft.dispose();}};
}

for(const [name,text,start,end,spoken,want,caret] of [
  ['empty draft','',0,0,'  A recognized thought.  ','A recognized thought.',21],
  ['existing draft','An unfinished thought',21,21,'and a new detail','An unfinished thought and a new detail',38],
  ['selected phrase','Keep the old thought.',9,12,'new','Keep the new thought.',12],
  ['middle caret','First last.',6,6,'middle','First middle last.',13],
])test(`dictation inserts into the ${name} for review without submitting`,()=>{
  // Question: Does recognized speech preserve surrounding typed text and use the captured selection without submitting it?
  // Limits: Real draft/submission controllers with EventTarget textarea stand-in; not browser selection APIs, recognition accuracy or input layout.
  const f=fixture({text,start,end});let inputs=0;f.input.addEventListener('input',()=>inputs++);const ticket=f.draft.begin();assert.ok(ticket);
  assert.equal(f.draft.accept(spoken,ticket),true);assert.equal(f.input.value,want);assert.equal(f.input.selectionStart,caret);assert.equal(f.input.selectionEnd,caret);assert.equal(f.input.focused,true);assert.equal(inputs,1);assert.deepEqual(f.sent,[]);
  f.form.dispatchEvent(new Event('submit',{cancelable:true}));assert.deepEqual(f.sent,[want]);assert.equal(f.draft.accept('Duplicate final result',ticket),false);f.cleanup();
});

for(const [name,change] of [
  ['thread changes',f=>f.state.thread='another-thread'],['draft changes',f=>f.input.value='Newer typed work'],
  ['typing then reverting',f=>{f.input.value='A temporary edit';f.input.dispatchEvent(new Event('input'));f.input.value='Original draft';}],
  ['selection changes',f=>f.input.setSelectionRange(0,0)],['busy state changes',f=>f.state.editable=false],
])test(`dictation preserves current work when ${name}`,()=>{
  // Question: Can a delayed transcript overwrite draft, caret or conversation ownership that changed after recognition began?
  // Limits: Controlled local ownership snapshots and input events; not cross-tab synchronization or undelivered native input events.
  const f=fixture({text:'Original draft'}),ticket=f.draft.begin();change(f);const before={value:f.input.value,start:f.input.selectionStart,end:f.input.selectionEnd};
  assert.equal(f.draft.accept('A stale recognized sentence',ticket),false);assert.deepEqual({value:f.input.value,start:f.input.selectionStart,end:f.input.selectionEnd},before);assert.deepEqual(f.sent,[]);assert.ok(f.notices.length);f.cleanup();
});

test('cancellation and an older attempt ticket cannot consume a newer dictation draft',()=>{
  // Question: Can a canceled transcript or stale completion callback insert text into a later dictation attempt?
  // Limits: Explicit attempt tickets and draft controller; transport callback ownership is covered by microphone tests.
  const f=fixture({text:'Typed draft'}),old=f.draft.begin();f.draft.cancel(old);assert.equal(f.draft.accept('Canceled speech',old),false);
  const current=f.draft.begin();f.draft.cancel(old);assert.equal(f.draft.pending,true);assert.equal(f.draft.accept('Old speech',old),false);assert.equal(f.draft.pending,true);
  assert.equal(f.draft.accept('Current speech',current),true);assert.equal(f.input.value,'Typed draft Current speech');f.cleanup();
});

test('empty recognition and overflow keep the existing draft intact without silent clipping',()=>{
  // Question: Can empty or overlong recognized output consume typed work, or appear as a successfully clipped draft?
  // Limits: HTML-style character capacity and transcript validation; not semantic error detection or provider output limits.
  const f=fixture({text:'Draft',maxLength:10});for(const text of ['', '  ',null,{},'An overlong recognition']){const ticket=f.draft.begin();assert.equal(f.draft.accept(text,ticket),false);assert.equal(f.input.value,'Draft');assert.deepEqual(f.sent,[]);}
  assert.ok(f.notices.some(message=>/long|limit/i.test(message)));f.cleanup();
});

test('a disposed draft controller cannot restart or insert late text',()=>{
  // Question: Can a page's disposed dictation controller still mutate its old textarea after navigation teardown?
  // Limits: Explicit cleanup and controller lifecycle; not browser BFCache restoration.
  const f=fixture({text:'Kept draft'}),ticket=f.draft.begin();f.cleanup();assert.equal(f.draft.accept('Late speech',ticket),false);assert.equal(f.draft.begin(),null);assert.equal(f.input.value,'Kept draft');
});
