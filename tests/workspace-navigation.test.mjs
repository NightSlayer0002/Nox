import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigation} from '../public/js/navigation.js';

class Element extends EventTarget {
  constructor(dataset={}) {super();this.dataset=dataset;this.children=[];this.attributes={};this.value='';this.hidden=false;this.classes=new Set();this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};}
  setAttribute(name,value){this.attributes[name]=String(value);}
  removeAttribute(name){delete this.attributes[name];}
  getAttribute(name){return this.attributes[name];}
  replaceChildren(...items){this.children=items;}
  append(...items){this.children.push(...items);}
  focus(){this.focused=true;}
  click(){this.dispatchEvent(new Event('click'));}
}
function fixture(hash='#conversation') {
  const ids=['view-label','workspace-heading','workspace-note','workspace-main','workspace-shell','recent-chats','resume-chats','history-search','history-count','history-list','history-storage-note','new-chat','export-history','today-label','menu-button','close-navigation','workspace-nav','presence-toggle','message','stage-time','stage-heading','stage-playback','stage-wrap','presence-toolbar','presence-menu','presence-menu-panel'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const panels=['conversation','explore','library','scenes','afterimage'].map(view=>new Element({panel:view}));
  const links=panels.map(panel=>new Element({view:panel.dataset.panel}));
  globalThis.document={body:{dataset:{visit:'guest'}},getElementById:id=>nodes[id],createElement:()=>new Element(),querySelectorAll:selector=>selector==='[data-panel]'?panels:selector==='a[data-view]'?links:[]};
  globalThis.location={get hash(){return hash;},set hash(value){hash=value.startsWith('#')?value:`#${value}`;}};globalThis.window=new EventTarget();window.scrollTo=()=>{};
  const calls=[];
  const thread={id:'a',turns:[],updated:Date.now()};const history={list:()=>[thread],active:()=>thread,persistent:false};
  const navigation=createNavigation({history,onOpen:id=>calls.push(['open',id]),onNew:()=>calls.push(['new']),onStart:text=>calls.push(['start',text])});
  return {nodes,panels,links,calls,navigation,thread};
}

test('internal routes keep an unsent draft and show only the selected task',()=>{
  const {nodes,panels,links,navigation,calls}=fixture();
  nodes.message.value='Keep this unfinished thought';
  for(const route of ['scenes','afterimage','library','conversation']){
    navigation.setView(route);
    assert.equal(nodes.message.value,'Keep this unfinished thought');
    assert.equal(document.body.dataset.view,route);
    assert.deepEqual(panels.filter(panel=>!panel.hidden).map(panel=>panel.dataset.panel),[route]);
    assert.equal(links.find(link=>link.dataset.view===route).getAttribute('aria-current'),'page');
  }
  assert.deepEqual(calls,[]);
});

test('mobile menu is accessible, closes on route changes and Escape restores its trigger',()=>{
  const {nodes,navigation}=fixture();
  assert.equal(nodes['menu-button'].getAttribute('aria-expanded'),'false');
  nodes['menu-button'].click();
  assert.equal(nodes['menu-button'].getAttribute('aria-expanded'),'true');
  assert.equal(document.body.dataset.menuOpen,'true');
  assert.equal(nodes['workspace-shell'].inert,true);
  navigation.setView('scenes');
  assert.equal(nodes['menu-button'].getAttribute('aria-expanded'),'false');
  nodes['menu-button'].click();
  const escape=new Event('keydown');Object.defineProperty(escape,'key',{value:'Escape'});window.dispatchEvent(escape);
  assert.equal(document.body.dataset.menuOpen,'false');
  assert.equal(nodes['workspace-shell'].inert,false);
  assert.equal(nodes['menu-button'].focused,true);
});

test('starters yield to user conversation and return for a new empty thread',()=>{
  const {thread,navigation}=fixture();
  assert.equal(document.body.dataset.conversationStarted,'false');
  thread.turns.push({role:'user',content:'Let us make a film'});navigation.render();
  assert.equal(document.body.dataset.conversationStarted,'true');
  thread.turns=[];navigation.render();
  assert.equal(document.body.dataset.conversationStarted,'false');
});

test('supporting NOX panel can collapse without switching route or clearing the composer',()=>{
  const {nodes}=fixture();nodes.message.value='A draft';
  nodes['presence-toggle'].click();
  assert.equal(document.body.dataset.presence,'hidden');
  assert.equal(nodes['presence-toggle'].getAttribute('aria-expanded'),'false');
  nodes['presence-toggle'].click();
  assert.equal(document.body.dataset.presence,'visible');
  assert.equal(document.body.dataset.view,'conversation');
  assert.equal(nodes.message.value,'A draft');
});

test('recent rows expose their complete title and identify the active conversation',()=>{
  const {nodes,thread,navigation}=fixture();
  thread.title='A long creative thought that is truncated only visually';
  thread.turns.push({role:'user',content:'Hello'});
  navigation.render();
  assert.equal(nodes['recent-chats'].children[0]?.textContent,thread.title);
  assert.equal(nodes['recent-chats'].children[0]?.getAttribute('title'),thread.title);
  assert.equal(nodes['recent-chats'].children[0]?.getAttribute('aria-current'),'true');
});

test('the scene clock moves into the Conversation card and returns above other stages',()=>{
  const {nodes,navigation}=fixture();
  assert.equal(nodes['stage-playback'].children.at(-1),nodes['stage-time']);
  navigation.setView('afterimage');
  assert.equal(nodes['stage-heading'].children.at(-1),nodes['stage-time']);
  navigation.setView('scenes');
  assert.equal(nodes['stage-heading'].children.at(-1),nodes['stage-time']);
  navigation.setView('conversation');
  assert.equal(nodes['stage-playback'].children.at(-1),nodes['stage-time']);
});

test('conversation shares its input dock and moves playback controls without rebuilding the stage',()=>{
  const {nodes,panels,navigation}=fixture(),dock=new Element({panel:'conversation'});
  panels.push(dock);nodes.message.value='A thought still being written';
  navigation.setView('conversation');assert.equal(dock.hidden,false);
  assert.equal(nodes['presence-menu-panel'].children.at(-1),nodes['stage-playback']);
  nodes['presence-menu'].open=true;
  navigation.setView('afterimage');assert.equal(dock.hidden,true);assert.equal(nodes['presence-menu'].open,false);
  assert.equal(nodes['stage-wrap'].children.at(-1),nodes['stage-playback']);
  navigation.setView('conversation');assert.equal(dock.hidden,false);
  assert.equal(nodes.message.value,'A thought still being written');
});
