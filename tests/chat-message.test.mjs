import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createChatMessage} from '../public/js/chat-message.js';

class Element {
  constructor(tagName){
    this.tagName=tagName.toUpperCase();this.children=[];this.attributes=new Map();this.className='';this.value='';
  }
  append(...children){this.children.push(...children);}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  getAttribute(name){return this.attributes.get(name)??null;}
  set textContent(value){this.value=String(value);this.children=[];}
  get textContent(){return this.value+this.children.map(child=>child.textContent).join('');}
  get lastChild(){return this.children.at(-1)??null;}
  get classList(){return {contains:name=>this.className.split(/\s+/).includes(name)};}
  set innerHTML(value){throw new Error(`Message markup must be assigned with textContent: ${value}`);}
}

// Run the app's integration function without starting the canvas, network, or voice.
// A minimal DOM is enough for this boundary; it also rejects unsafe HTML writes.
const appSource=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
const addMessageSource=appSource.match(/function addMessage\(speaker, text\) \{[\s\S]*?\n\}/)?.[0];
function fixture(){
  assert.ok(addMessageSource,'the app exposes its message insertion boundary');
  const conversation=new Element('div');conversation.scrollHeight=180;conversation.scrollTop=0;
  const document={createElement:tag=>new Element(tag)};
  const context=vm.createContext({document,createChatMessage,$:id=>{assert.equal(id,'conversation');return conversation;}});
  const addMessage=vm.runInContext(`(${addMessageSource})`,context);
  return {addMessage,conversation,document};
}

test('NOX replies show a small decorative logo beside an accessible speaker name',()=>{
  const {addMessage}=fixture();
  const message=addMessage('nox','A thought.');
  const avatar=message.children.find(child=>child.tagName==='IMG');
  assert.ok(avatar,'NOX replies need a logo beside their content');
  assert.equal(avatar.className,'message-avatar');
  assert.equal(avatar.getAttribute('src'),'/icon.svg');
  assert.equal(avatar.getAttribute('width'),'24');
  assert.equal(avatar.getAttribute('height'),'24');
  assert.equal(avatar.getAttribute('alt'),'');
  assert.equal(avatar.getAttribute('aria-hidden'),'true');
  const label=message.children.find(child=>child.classList.contains('speaker'));
  assert.equal(label.textContent,'NOX');
  assert.equal(label.classList.contains('sr-only'),true);
  assert.ok(message.children.indexOf(avatar)<message.children.indexOf(message.lastChild));
});

test('user messages keep their speaker accessible without an avatar',()=>{
  const {addMessage}=fixture();
  const message=addMessage('user','My thought.');
  assert.equal(message.children.some(child=>child.tagName==='IMG'),false);
  const label=message.children.find(child=>child.classList.contains('speaker'));
  assert.equal(label.textContent,'You');
  assert.equal(label.classList.contains('sr-only'),true);
});

test('connection messages retain their visible speaker label',()=>{
  const {addMessage}=fixture();
  const message=addMessage('system','The connection is unavailable.');
  const label=message.children.find(child=>child.classList.contains('speaker'));
  assert.equal(label.textContent,'Connection');
  assert.equal(label.classList.contains('sr-only'),false);
  assert.equal(message.children.some(child=>child.tagName==='IMG'),false);
});

test('message markup is displayed literally instead of becoming elements',()=>{
  const {addMessage}=fixture();
  const text='<img src=x onerror=alert(1)><script>alert(2)</script> & a thought';
  for(const role of ['nox','user','system']){
    const content=addMessage(role,text).lastChild;
    assert.equal(content.textContent,text);
    assert.deepEqual(content.children,[]);
  }
});

test('unrecognized roles cannot inject message classes or impersonate NOX',()=>{
  const {addMessage}=fixture();
  const message=addMessage('nox user','Untrusted role');
  assert.equal(message.className,'message system');
  assert.equal(message.children[0].textContent,'Connection');
  assert.equal(message.children.some(child=>child.tagName==='IMG'),false);
});

test('streamed text updates the final paragraph without replacing the logo or speaker',()=>{
  const {addMessage,conversation,document}=fixture();
  const message=addMessage('nox','');
  const content=message.lastChild;
  assert.equal(content.tagName,'P');
  content.textContent='A partial';
  message.lastChild.textContent='A completed thought.';
  assert.equal(message.lastChild,content);
  assert.equal(content.textContent,'A completed thought.');
  assert.equal(message.children.find(child=>child.classList.contains('speaker')).textContent,'NOX');
  const sources=document.createElement('p');sources.className='knowledge-sources';sources.textContent='Context included: a source';
  message.append(sources);
  assert.equal(message.children.at(-2),content);
  assert.equal(conversation.lastChild,message);
  assert.equal(conversation.scrollTop,180);
});
