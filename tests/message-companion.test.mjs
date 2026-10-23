import test from 'node:test';
import assert from 'node:assert/strict';
import {attachMessageCompanion} from '../public/js/message-companion.js';

class Element extends EventTarget {
  constructor(tagName,documentTarget){
    super();this.tagName=tagName.toUpperCase();this.ownerDocument=documentTarget;this.parentElement=null;
    this.children=[];this.attributes=new Map();this.className='';this.style={};this.dataset={};this.value='';
    this.rect={left:0,top:0,right:240,bottom:160,width:240,height:160};
  }
  append(...children){for(const child of children){child.remove();child.parentElement=this;this.children.push(child);}}
  remove(){if(this.parentElement){const siblings=this.parentElement.children;siblings.splice(siblings.indexOf(this),1);this.parentElement=null;}}
  contains(element){return element===this||this.children.some(child=>child.contains(element));}
  get isConnected(){return this===this.ownerDocument.body||Boolean(this.parentElement?.isConnected);}
  get classList(){return {contains:name=>this.className.split(/\s+/).includes(name)};}
  matches(selector){return selector.startsWith('.')&&selector.slice(1).split('.').every(name=>this.classList.contains(name));}
  closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)??null;}
  querySelector(selector){for(const child of this.children){if(child.matches(selector))return child;const nested=child.querySelector(selector);if(nested)return nested;}return null;}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  getAttribute(name){return this.attributes.get(name)??null;}
  getBoundingClientRect(){return this.rect;}
  focus(){this.ownerDocument.activeElement=this;}
  click(){this.dispatchEvent(new Event('click'));}
  set textContent(value){this.value=String(value);this.children=[];}
  get textContent(){return this.value+this.children.map(child=>child.textContent).join('');}
  set innerHTML(value){throw new Error(`Unsafe HTML write: ${value}`);}
}

function fixture(t,options={}){
  t.mock.timers.enable({apis:['setTimeout']});
  const documentTarget=new EventTarget(),windowTarget=new EventTarget();
  Object.assign(windowTarget,{innerWidth:800,innerHeight:600});
  Object.assign(documentTarget,{defaultView:windowTarget,createElement:tag=>new Element(tag,documentTarget)});
  documentTarget.body=new Element('body',documentTarget);documentTarget.activeElement=documentTarget.body;
  documentTarget.querySelector=selector=>documentTarget.body.querySelector(selector);
  const conversation=documentTarget.createElement('div');documentTarget.body.append(conversation);
  const overlay=documentTarget.createElement('div');documentTarget.body.append(overlay);
  let hits=[overlay];documentTarget.elementsFromPoint=()=>hits;
  const calls=[];
  const companion=attachMessageCompanion({documentTarget,conversation,onAction:action=>calls.push(action),...options});
  t.after(()=>companion.dispose());
  function message(role='nox',text='A completed thought.'){
    const node=documentTarget.createElement('div');node.className=`message ${role}`;
    const speaker=documentTarget.createElement('p');speaker.className='speaker';speaker.textContent='NOX';
    const content=documentTarget.createElement('p');content.className='message-content';content.textContent=text;
    node.append(speaker,content);conversation.append(node);return node;
  }
  const menu=()=>documentTarget.querySelector('.message-companion-menu');
  const button=kind=>menu()?.children.find(node=>node.dataset.action===kind);
  return {documentTarget,windowTarget,conversation,companion,calls,message,menu,button,setHits(...items){hits=[overlay,...items];}};
}

function dispatchAt(target,type,properties={}){
  const event=new Event(type,{cancelable:true});
  for(const [key,value] of Object.entries(properties))Object.defineProperty(event,key,{value});
  target.dispatchEvent(event);return event;
}

test('a stationary 650ms drag hold sees a completed message behind NOX without sending',t=>{
  const f=fixture(t),message=f.message();f.setHits(message.querySelector('.message-content'),message);
  f.companion.inspect({x:80,y:100,dragging:true});t.mock.timers.tick(649);
  assert.equal(f.menu(),null);
  t.mock.timers.tick(1);
  assert.ok(f.menu());assert.equal(f.menu().getAttribute('aria-label'),'Actions for this message');
  assert.equal(f.menu().getAttribute('role'),'group');assert.equal(f.menu().style.position,'fixed');
  assert.deepEqual(f.calls,[]);
  f.companion.release();assert.ok(f.menu());assert.deepEqual(f.calls,[]);
});

test('passive placement, draft replies, system messages, and foreign messages cannot arm actions',t=>{
  const f=fixture(t),completed=f.message(),draft=f.message('nox draft'),system=f.message('system'),foreign=f.message();
  foreign.remove();f.documentTarget.body.append(foreign);
  f.setHits(completed);f.companion.inspect({x:80,y:100,dragging:false});t.mock.timers.tick(1000);
  assert.equal(f.menu(),null);
  for(const message of [draft,system,foreign]){
    f.setHits(message);f.companion.inspect({x:80,y:100,dragging:true});t.mock.timers.tick(1000);assert.equal(f.menu(),null);
    assert.equal(f.companion.openFor(message),false);
  }
  assert.deepEqual(f.calls,[]);
});

test('release before dwell, pointer cancellation, clear, and disposal cancel pending actions',t=>{
  const f=fixture(t),message=f.message();f.setHits(message);
  for(const cancel of [()=>f.companion.release(),()=>f.companion.release({cancel:true}),()=>f.companion.clear()]){
    f.companion.inspect({x:80,y:100,dragging:true});t.mock.timers.tick(400);cancel();t.mock.timers.tick(1000);assert.equal(f.menu(),null);
  }
  f.companion.inspect({x:80,y:100,dragging:true});f.companion.dispose();t.mock.timers.tick(1000);
  assert.equal(f.menu(),null);assert.equal(f.companion.openFor(message),false);assert.deepEqual(f.calls,[]);
});

test('moving to another message or more than 12px restarts the stationary hold',t=>{
  const f=fixture(t),first=f.message(),second=f.message('user','A second thought.');f.setHits(first);
  f.companion.inspect({x:80,y:100,dragging:true});t.mock.timers.tick(400);
  f.companion.inspect({x:93,y:100,dragging:true});t.mock.timers.tick(400);assert.equal(f.menu(),null);
  f.setHits(second);f.companion.inspect({x:93,y:100,dragging:true});t.mock.timers.tick(649);assert.equal(f.menu(),null);
  t.mock.timers.tick(1);assert.ok(f.menu());f.button('explain').click();
  assert.equal(f.calls[0].message,second);
});

test('small pointer jitter keeps the original dwell and cancellation closes an opened menu',t=>{
  const f=fixture(t),message=f.message();f.setHits(message);
  f.companion.inspect({x:80,y:100,dragging:true});t.mock.timers.tick(400);
  f.companion.inspect({x:84,y:106,dragging:true});t.mock.timers.tick(250);assert.ok(f.menu());
  f.companion.release({cancel:true});assert.equal(f.menu(),null);assert.deepEqual(f.calls,[]);
});

test('only explicit actions pass the selected content as literal text',t=>{
  const f=fixture(t),text='<img src=x onerror=alert(1)> & a thought',message=f.message('user',text);
  const metadata=f.documentTarget.createElement('p');metadata.className='knowledge-sources';metadata.textContent='Context included: private source';message.append(metadata);
  for(const kind of ['explain','read','quiz']){
    assert.equal(f.companion.openFor(message),true);assert.deepEqual(f.calls.length,['explain','read','quiz'].indexOf(kind));
    f.button(kind).click();assert.equal(f.menu(),null);
    assert.deepEqual(f.calls.at(-1),{kind,message,text});
  }
});

test('removed messages cannot open late or dispatch actions from an old menu',t=>{
  const f=fixture(t),message=f.message();f.setHits(message);
  f.companion.inspect({x:80,y:100,dragging:true});message.remove();t.mock.timers.tick(650);assert.equal(f.menu(),null);
  f.conversation.append(message);f.companion.openFor(message);message.remove();f.button('quiz').click();
  assert.equal(f.menu(),null);assert.deepEqual(f.calls,[]);
});

test('an emptied or newly drafting message is revalidated before an explicit action',t=>{
  const f=fixture(t),message=f.message();
  f.companion.openFor(message);message.className='message nox draft';f.button('read').click();assert.deepEqual(f.calls,[]);
  message.className='message nox';f.companion.openFor(message);message.querySelector('.message-content').textContent='   ';
  f.button('explain').click();assert.deepEqual(f.calls,[]);assert.equal(f.menu(),null);
});

test('keyboard actions focus the first button and Escape or Close restores their trigger',t=>{
  const f=fixture(t),message=f.message(),trigger=f.documentTarget.createElement('button');message.append(trigger);trigger.focus();
  f.companion.openFor(message);assert.equal(f.documentTarget.activeElement,f.button('explain'));assert.deepEqual(f.calls,[]);
  const event=dispatchAt(f.documentTarget,'keydown',{key:'Escape'});
  assert.equal(f.menu(),null);assert.equal(event.defaultPrevented,true);assert.equal(f.documentTarget.activeElement,trigger);
  f.companion.openFor(message);f.menu().querySelector('.message-companion-close').click();assert.equal(f.documentTarget.activeElement,trigger);
});

test('outside pointers dismiss without stealing focus, while internal pointers keep the menu',t=>{
  const f=fixture(t),message=f.message(),outside=f.documentTarget.createElement('button');f.documentTarget.body.append(outside);
  f.companion.openFor(message);dispatchAt(f.documentTarget,'pointerdown',{target:f.button('quiz')});assert.ok(f.menu());
  outside.focus();dispatchAt(f.documentTarget,'pointerdown',{target:outside});assert.equal(f.menu(),null);assert.equal(f.documentTarget.activeElement,outside);
  const event=dispatchAt(f.documentTarget,'keydown',{key:'Escape'});assert.equal(event.defaultPrevented,false);
});

test('long messages disclose bounded reading and clamp menus inside the visual viewport',t=>{
  const f=fixture(t),viewport=Object.assign(new EventTarget(),{offsetLeft:40,offsetTop:100,width:320,height:300});
  f.windowTarget.visualViewport=viewport;
  const message=f.message('nox','x'.repeat(421));message.rect={left:350,top:380,right:500,bottom:500,width:150,height:120};
  f.companion.openFor(message);assert.match(f.button('read').textContent,/Read opening/);
  let menu=f.menu(),left=parseFloat(menu.style.left),top=parseFloat(menu.style.top);
  assert.ok(left>=48&&left+240<=352);assert.ok(top>=108&&top+160<=392);
  f.companion.clear();message.querySelector('.message-content').textContent='x'.repeat(420);f.companion.openFor(message);
  assert.match(f.button('read').textContent,/Read aloud/);assert.deepEqual(f.calls,[]);
});

test('a deliberate hold marks its candidate and shows one timed progress trace until the menu opens',t=>{
  const f=fixture(t,{dwellMs:800}),message=f.message();f.setHits(message);
  f.companion.inspect({x:80,y:100,dragging:true});
  const progress=message.querySelector('.message-companion-dwell');
  assert.equal(message.dataset.companionState,'holding');
  assert.ok(progress,'the candidate needs a visible dwell cue');
  assert.equal(progress.getAttribute('aria-hidden'),'true');
  assert.equal(progress.style.animationDuration,'800ms');
  t.mock.timers.tick(400);f.companion.inspect({x:84,y:103,dragging:true});
  assert.equal(message.querySelector('.message-companion-dwell'),progress,'small jitter preserves the progress');
  t.mock.timers.tick(400);
  assert.equal(message.querySelector('.message-companion-dwell'),null);
  assert.equal(message.dataset.companionState,'selected');
  assert.ok(f.menu());assert.deepEqual(f.calls,[]);
  f.companion.clear();assert.equal(message.dataset.companionState,undefined);
});

test('restarting or moving away from a hold removes the old trace and candidate highlight',t=>{
  const f=fixture(t),first=f.message(),second=f.message('user','Another thought.');f.setHits(first);
  f.companion.inspect({x:80,y:100,dragging:true});
  const old=first.querySelector('.message-companion-dwell');t.mock.timers.tick(400);
  f.companion.inspect({x:94,y:100,dragging:true});
  assert.ok(old);assert.equal(old.parentElement,null);
  assert.notEqual(first.querySelector('.message-companion-dwell'),old,'a fresh trace restarts the visible countdown');
  f.setHits(second);f.companion.inspect({x:94,y:100,dragging:true});
  assert.equal(first.dataset.companionState,undefined);assert.equal(first.querySelector('.message-companion-dwell'),null);
  assert.equal(second.dataset.companionState,'holding');
  f.setHits();f.companion.inspect({x:94,y:100,dragging:true});
  assert.equal(second.dataset.companionState,undefined);assert.equal(second.querySelector('.message-companion-dwell'),null);
  t.mock.timers.tick(1000);assert.equal(f.menu(),null);assert.deepEqual(f.calls,[]);
});

test('release, cancellation, clear, disposal, and stale content clean up dwell feedback',t=>{
  const f=fixture(t),message=f.message();f.setHits(message);
  for(const cancel of [()=>f.companion.release(),()=>f.companion.release({cancel:true}),()=>f.companion.clear()]){
    f.companion.inspect({x:80,y:100,dragging:true});assert.equal(message.dataset.companionState,'holding');cancel();
    assert.equal(message.dataset.companionState,undefined);assert.equal(message.querySelector('.message-companion-dwell'),null);
  }
  f.companion.inspect({x:80,y:100,dragging:true});message.className='message nox draft';t.mock.timers.tick(650);
  assert.equal(message.dataset.companionState,undefined);assert.equal(message.querySelector('.message-companion-dwell'),null);assert.equal(f.menu(),null);
  message.className='message nox';f.companion.inspect({x:80,y:100,dragging:true});f.companion.dispose();
  assert.equal(message.dataset.companionState,undefined);assert.equal(message.querySelector('.message-companion-dwell'),null);assert.deepEqual(f.calls,[]);
});

test('the contextual panel describes its actions and keeps the selected message marked until dismissed',t=>{
  const f=fixture(t),message=f.message('nox','A <literal> passage & a second line.');
  f.companion.openFor(message);
  assert.equal(message.dataset.companionState,'selected');
  assert.equal(f.menu().querySelector('.message-companion-preview').textContent,'A <literal> passage & a second line.');
  for(const kind of ['explain','read','quiz']){
    assert.ok(f.button(kind).querySelector('.message-companion-action-label'));
    assert.ok(f.button(kind).querySelector('.message-companion-action-detail').textContent);
  }
  f.menu().querySelector('.message-companion-close').click();
  assert.equal(message.dataset.companionState,undefined);assert.deepEqual(f.calls,[]);
});

test('arrow keys navigate explicit message actions without triggering one',t=>{
  const f=fixture(t),message=f.message();f.companion.openFor(message);
  for(const [key,kind] of [['ArrowDown','read'],['End','quiz'],['ArrowDown','explain'],['ArrowUp','quiz'],['Home','explain']]){
    const event=dispatchAt(f.documentTarget,'keydown',{key});
    assert.equal(event.defaultPrevented,true);assert.equal(f.documentTarget.activeElement,f.button(kind));
  }
  assert.deepEqual(f.calls,[]);
});

test('dismissed or replaced action buttons cannot dispatch stale or duplicate actions',t=>{
  const f=fixture(t),first=f.message(),second=f.message('user','Another thought.');
  f.companion.openFor(first);const old=f.button('explain');f.companion.openFor(second);old.click();
  assert.equal(f.calls.length,0);assert.ok(f.menu());assert.equal(first.dataset.companionState,undefined);
  const current=f.button('read');current.click();current.click();
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].kind,'read');assert.equal(f.calls[0].message,second);assert.equal(f.calls[0].text,'Another thought.');
  assert.equal(second.dataset.companionState,undefined);
});
