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
  showModal(){this.open=true;}
  close(){this.open=false;}
}
function fixture(hash='#conversation') {
  const ids=['view-label','workspace-heading','workspace-note','workspace-main','workspace-shell','recent-chats','resume-chats','history-search','history-count','history-list','history-storage-note','new-chat','export-history','today-label','menu-button','close-navigation','workspace-nav','presence-toggle','message','stage-time','stage-heading','stage-playback','replay-voice','stage-wrap','presence-toolbar','presence-menu','presence-menu-panel','conversation-privacy','archive-notice','archive-notice-text','archive-download','archive-reset','archive-reset-dialog','archive-reset-cancel','archive-reset-confirm'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const panels=['conversation','explore','library','scenes','afterimage'].map(view=>new Element({panel:view}));
  const links=panels.map(panel=>new Element({view:panel.dataset.panel}));
  globalThis.document={body:{dataset:{visit:'guest'}},getElementById:id=>nodes[id],createElement:()=>new Element(),querySelectorAll:selector=>selector==='[data-panel]'?panels:selector==='a[data-view]'?links:[]};
  globalThis.location={get hash(){return hash;},set hash(value){hash=value.startsWith('#')?value:`#${value}`;}};globalThis.window=new EventTarget();window.scrollTo=()=>{};
  const calls=[];
  const thread={id:'a',turns:[],updated:Date.now()};const history={list:()=>[thread],active:()=>thread,persistent:false};
  const navigation=createNavigation({history,onOpen:id=>calls.push(['open',id]),onNew:()=>calls.push(['new']),onStart:text=>calls.push(['start',text])});
  return {nodes,panels,links,calls,navigation,thread,history};
}

test('Chats empty state offers a working start action and explains temporary guest privacy',async()=>{
  const {nodes,calls}=fixture('#library');
  const empty=nodes['history-list'].children[0],button=empty.children.find(child=>child.textContent==='Start conversation');
  assert.ok(button);button.click();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,[['new']]);assert.equal(document.body.dataset.view,'conversation');assert.equal(nodes.message.focused,true);
  assert.match(nodes['conversation-privacy'].textContent,/This visit only.*refresh/);
  assert.equal(nodes['history-storage-note'].hidden,false);
});

test('archive recovery needs an explicit confirmation and reports a changed original without resetting it',async()=>{
  const {nodes,history,navigation}=fixture();let resets=0;history.recovery={reason:'invalid'};history.resetArchive=async()=>{resets++;return false;};
  navigation.render();assert.equal(nodes['archive-notice'].hidden,false);assert.match(nodes['archive-notice-text'].textContent,/untouched/);
  nodes['archive-reset'].click();assert.equal(resets,0);assert.equal(nodes['archive-reset-dialog'].open,true);
  nodes['archive-reset-confirm'].click();await new Promise(resolve=>setImmediate(resolve));assert.equal(resets,1);
  assert.match(nodes['archive-notice-text'].textContent,/changed|not.*reset|not.*replaced/i);
});

test('deleting a chat requires a separate confirmation and Keep preserves the row',async()=>{
  const {nodes,thread,history,navigation}=fixture('#library');let removed=0;history.remove=async()=>{removed++;return true;};
  thread.title='Important conversation';thread.turns.push({role:'user',content:'Keep until confirmed'});navigation.render();
  let row=nodes['history-list'].children[0];row.children[1].click();assert.equal(removed,0);
  row.children.at(-1).children.find(node=>node.textContent==='Keep').click();assert.equal(removed,0);
  row.children[1].click();row.children.at(-1).children.find(node=>node.textContent==='Delete conversation').click();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(removed,1);
});

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


test('failed chat deletion keeps its row and offers retry or Keep instead of opening another chat',async()=>{
  const {nodes,thread,history,navigation,calls}=fixture('#library');
  thread.title='Still saved';thread.turns.push({role:'user',content:'Do not hide this conversation'});
  history.lastError='delete-not-saved';history.remove=async()=>false;navigation.render();
  const row=nodes['history-list'].children[0];row.children[1].click();
  const confirmation=row.children.at(-1),confirm=confirmation.children.find(node=>node.textContent==='Delete conversation');
  confirm.click();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,[]);assert.equal(nodes['history-list'].children[0],row);
  assert.match(confirmation.children[0].textContent,/not.*removed|could not.*delet/i);
  assert.equal(confirm.disabled,false);assert.equal(confirmation.children.at(-1).disabled,false);
});
