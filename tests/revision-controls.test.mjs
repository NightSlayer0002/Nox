import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHistory} from '../public/js/history.js';
import {createTurnGate} from '../public/js/turns.js';
import {historyFailure} from '../public/js/history-notice.js';
import {createRevisionControls,attachRevisionControls} from '../public/js/revision-controls.js';

class Node{
  constructor(tag,doc){this.tagName=tag.toUpperCase();this.doc=doc;this.children=[];this.attributes=new Map();this.events=new Map();this.value='';this.hidden=false;this.dataset={};}
  append(...nodes){this.children.push(...nodes);for(const node of nodes)node.parentNode=this;}
  before(node){const list=this.parentNode.children;list.splice(list.indexOf(this),0,node);node.parentNode=this.parentNode;}
  setAttribute(name,value){this.attributes.set(name,String(value));}getAttribute(name){return this.attributes.get(name)??null;}removeAttribute(name){this.attributes.delete(name);}
  addEventListener(name,fn){const values=this.events.get(name)||[];values.push(fn);this.events.set(name,values);}removeEventListener(name,fn){this.events.set(name,(this.events.get(name)||[]).filter(value=>value!==fn));}
  async fire(name,event={}){for(const fn of this.events.get(name)||[])await fn(event);}
  focus(){this.doc.activeElement=this;}querySelector(selector){return this.children.find(node=>selector===`.${node.className}`)||null;}
  set innerHTML(value){throw Error('Unsafe HTML assignment.');}
}
const documentFor=()=>{const doc=new Node('document');doc.doc=doc;doc.createElement=tag=>new Node(tag,doc);doc.querySelector=()=>null;return doc;};
const source=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
const actionsSource=source.slice(source.indexOf('function attachMessageActions('),source.indexOf('\nasync function exploreWithNox'));
async function fixture(){
  const values=new Map(),storage={temporary:true,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},history=await createHistory(storage);
  for(const [role,content] of [['user','First question'],['assistant','First answer'],['user','Later question'],['assistant','Later answer']])await history.append(role,content);
  const doc=documentFor(),input=doc.createElement('textarea'),form=doc.createElement('form'),dock=doc.createElement('section');dock.append(form);
  const notices=[],state={edit:null},controls=createRevisionControls({getEdit:()=>state.edit,setEdit:value=>{state.edit=value;},getDraft:()=>input.value,setDraft:value=>{input.value=value;},getThread:()=>history.active(),onNotice:value=>notices.push(value),onFocus:()=>input.focus()});
  return {history,storage,doc,input,form,dock,notices,state,controls,target:(seq,role='user')=>history.revisionTarget(seq,{role})};
}

test('Cancel edit restores the prior draft and clear/retype retains visible edit scope',async()=>{
  // Question: Can a cleared composer silently escape edit intent or lose its earlier draft?
  // Limits: Controller and synthetic DOM state; no browser rendering or persistence claim.
  const f=await fixture();f.input.value='An independent unfinished thought';f.controls.edit(f.target(1),'First question');
  assert.equal(f.controls.snapshot().kind,'edit');assert.equal(f.controls.snapshot().following,3);
  f.input.value='';f.controls.sync();assert.equal(f.controls.snapshot().kind,'edit');f.input.value='A rewritten question';
  f.controls.cancel();assert.equal(f.input.value,'An independent unfinished thought');assert.equal(f.state.edit,null);assert.equal(f.controls.snapshot(),null);
});

test('opening the same edit preserves typed changes and conflicting edits/retries leave work intact',async()=>{
  // Question: Can another message action overwrite an active revision or its backup?
  // Limits: Explicit controller handoffs; no touch/hover discoverability evidence.
  const f=await fixture();f.input.value='Earlier draft';f.controls.edit(f.target(1),'First question');f.input.value='Unsent correction';let retries=0;
  assert.equal(f.controls.edit(f.target(1),'First question'),true);assert.equal(f.input.value,'Unsent correction');
  assert.equal(f.controls.edit(f.target(3),'Later question'),false);assert.equal(await f.controls.requestRetry(f.target(2,'assistant'),()=>retries++),false);
  assert.equal(retries,0);assert.equal(f.input.value,'Unsent correction');f.controls.cancel();assert.equal(f.input.value,'Earlier draft');
});

for(const newer of [false,true])test(`finishing an edit preserves the ${newer?'newer typed':'pre-edit'} draft`,async()=>{
  // Question: Does successful revision completion consume unrelated composer text?
  // Limits: Controlled completion boundary; the actual storage transaction is tested elsewhere.
  const f=await fixture();f.input.value='Earlier draft';f.controls.edit(f.target(1),'First question');f.input.value='Submitted correction';
  if(newer)f.input.value='A newer thought';f.controls.finish('Submitted correction');
  assert.equal(f.input.value,newer?'A newer thought':'Earlier draft');assert.equal(f.state.edit,null);
});

test('an older Retry waits for explicit confirmation and keeps its originally captured revision',async()=>{
  // Question: Can confirmation silently bless a transcript changed after Retry opened?
  // Limits: Real history with a controlled competing write; not native cross-tab scheduling.
  const f=await fixture(),target=f.target(2,'assistant'),original=f.storage.getItem('nox.chats.v1');let captured;
  await f.controls.requestRetry(target,value=>{captured=value;return f.history.retryFrom(value);});
  assert.equal(f.storage.getItem('nox.chats.v1'),original);assert.equal(f.controls.snapshot().following,2);
  await f.history.append('user','A new turn after the prompt');const changed=f.storage.getItem('nox.chats.v1');
  assert.equal(await f.controls.confirm(),null);assert.equal(captured,target);assert.equal(f.storage.getItem('nox.chats.v1'),changed);
});

test('confirmed older Retry removes exactly its announced scope while latest Retry starts immediately',async()=>{
  // Question: Is destructive confirmation limited to replies with later messages?
  // Limits: Real history/controller, synthetic caller; no provider or visual-layout guarantee.
  const older=await fixture();await older.controls.requestRetry(older.target(2,'assistant'),value=>older.history.retryFrom(value));
  assert.equal(older.history.active().turns.length,4);await older.controls.confirm();assert.deepEqual(older.history.active().turns.map(turn=>turn.content),['First question']);
  const latest=await fixture();await latest.controls.requestRetry(latest.target(4,'assistant'),value=>latest.history.retryFrom(value));
  assert.equal(latest.controls.snapshot(),null);assert.equal(latest.history.active().turns.length,3);
});

test('call suspension preserves the edit revision and Cancel can still restore its original draft',async()=>{
  // Question: Can a call restore edit text and its backup without upgrading stale intent?
  // Limits: The call draft hook is modeled here; microphone and modal lifecycle are separate.
  const f=await fixture();f.input.value='Earlier draft';f.controls.edit(f.target(1),'First question');f.input.value='Unsent correction';
  const saved={text:f.input.value,edit:f.state.edit};f.state.edit=null;f.controls.sync();await f.history.append('user','Spoken turn');
  f.input.value=saved.text;f.state.edit=saved.edit;f.controls.sync();assert.equal(await f.history.replaceFrom(f.state.edit,f.input.value),null);
  f.controls.cancel();assert.equal(f.input.value,'Earlier draft');
});

test('thread handoffs are blocked only while an uncommitted edit is active',async()=>{
  // Question: Can switching threads discard an edit or block cancellation after commit?
  // Limits: Deliberate controller navigation; no per-thread draft archive is introduced.
  const f=await fixture();f.input.value='Earlier draft';f.controls.edit(f.target(1),'First question');assert.equal(f.controls.canLeave(),false);
  f.controls.finish('First question');assert.equal(f.controls.canLeave(),true);assert.equal(f.input.value,'Earlier draft');
});

test('inline controls expose scope, native buttons, and Escape cancellation outside composition',async()=>{
  // Question: Are edit intent and a keyboard cancellation route present in the DOM?
  // Limits: Synthetic DOM; contrast, screen readers and real keyboard focus need browser QA.
  const f=await fixture(),release=attachRevisionControls({controls:f.controls,form:f.form,input:f.input,documentTarget:f.doc});
  f.input.value='Earlier draft';f.controls.edit(f.target(1),'First question');const panel=f.dock.children[0];
  assert.equal(panel.hidden,false);assert.match(panel.children[0].textContent,/Editing/);assert.match(panel.children[1].textContent,/3 messages/);
  const cancel=panel.children[2].children[0];assert.equal(cancel.tagName,'BUTTON');assert.equal(cancel.type,'button');assert.match(cancel.textContent,/Cancel edit/);
  const escape={key:'Escape',isComposing:true,preventDefault(){this.defaultPrevented=true;}};await f.doc.fire('keydown',escape);assert.notEqual(f.state.edit,null);
  escape.isComposing=false;await f.doc.fire('keydown',escape);assert.equal(f.state.edit,null);assert.equal(f.input.value,'Earlier draft');assert.equal(escape.defaultPrevented,true);release();
});

for(const role of ['user','assistant'])test(`the actual ${role==='user'?'Edit':'older Retry'} message action uses the explicit revision controls`,async()=>{
  // Question: Is the controller connected to the real message action rather than only unit-tested?
  // Limits: Extracted production boundary with real history; no full app/browser execution.
  const f=await fixture();f.input.value='Earlier draft';const context=vm.createContext({history:f.history,document:f.doc,navigator:{clipboard:{writeText:async()=>{}}},busy:false,viewReady:true,editTarget:null,revisionControls:f.controls,
    composer:{setValue:value=>{f.input.value=value;}},replyDiagnostics:{setStatus(){}},$:()=>f.input,toast:value=>f.notices.push(value),cancelConversation(){},turns:createTurnGate(),historyFailure,restoreConversation:async()=>1,send:async()=>{},messageCompanion:null});
  Object.defineProperty(context,'editTarget',{get:()=>f.state.edit,set:value=>{f.state.edit=value;},configurable:true});
  vm.runInContext(actionsSource,context);const turn=f.history.active().turns.find(turn=>turn.role===role),message=f.doc.createElement('div');context.attachMessageActions(message,turn);
  const original=f.storage.getItem('nox.chats.v1');await message.children[0].children[1].fire('click');
  if(role==='user'){f.controls.cancel();assert.equal(f.input.value,'Earlier draft');}
  else{assert.equal(f.storage.getItem('nox.chats.v1'),original);assert.equal(f.controls.snapshot().kind,'retry');}
});
