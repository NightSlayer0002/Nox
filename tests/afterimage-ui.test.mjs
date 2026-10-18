import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import {FIRST_CONTACT} from '../client/afterimage-example.js';

// Exercise the receiver's real event handlers without a stage, browser or model request.
const root=path.resolve(import.meta.dirname,'..');
const nativeRequire=createRequire(import.meta.url);
const bundle=await build({entryPoints:[path.join(root,'client/afterimage.jsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'transform',plugins:[{name:'receiver-harness',setup(builder){
  builder.onResolve({filter:/^(react|react-dom|motion\/react)$/},args=>({path:args.path,external:true}));
  builder.onResolve({filter:/afterimage-lattice\.jsx$/},()=>({path:'test-lattice',external:true}));
  builder.onResolve({filter:/^\/js\/(afterimage-bridge|visit-scope|workbench)\.js$/},args=>({path:args.path,external:true}));
  builder.onResolve({filter:/^\/js\//},args=>({path:path.join(root,'public',args.path.slice(1))}));
}}]});

function receiver({owner=false,kind='live',exportProfile='landscape',recording=false,receive=async()=>{throw Error('Unexpected generation');}}={}){
  let slots=[],cursor=0,pendingEffects=[],tree,plays=[],requests=[],state={connected:true,status:'idle',connection:{kind},recordSupported:true,voiceEnabled:false,exportProfile,recording};
  const subscribers=new Set(),data=new Map(),storage={temporary:!owner,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),Suspense:'suspense',lazy:()=> 'lattice',useRef(value){const index=cursor++;return slots[index]??= {current:value};},useState(initial){const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value;}];},useEffect(effect,deps){const index=cursor++,old=slots[index];if(!old||deps.some((value,i)=>value!==old.deps[i])){pendingEffects.push(()=>{old?.cleanup?.();slots[index]={deps,cleanup:effect()};});}},useReducedMotion:()=>false};
  const bridge={snapshot:()=>state,subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn);},stop(){state={...state,status:'stopped'};for(const fn of subscribers)fn();},play(...args){plays.push(args);state={...state,status:'playing'};for(const fn of subscribers)fn();return true;},recordAndPlay(...args){plays.push(args);return true;},receive(options){requests.push(options);return receive(options);},setVoice(value){state={...state,voiceEnabled:value};},setExportProfile(value){state={...state,exportProfile:value};for(const fn of subscribers)fn();}};
  const mocks={'react':react,'react-dom':{createPortal:children=>children},'motion/react':{AnimatePresence:'presence',motion:{div:'motion-div'},useReducedMotion:react.useReducedMotion},'test-lattice':{},'/js/afterimage-bridge.js':{afterimageBridge:bridge},'/js/visit-scope.js':{visit:{owner,storage}},'/js/workbench.js':{downloadText(){}}};
  const module={exports:{}};
  vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,require:id=>mocks[id]??nativeRequire(id),window:{innerWidth:1400,matchMedia:()=>({matches:false})},document:{body:{},getElementById:()=>null},AbortController,Date,console,setTimeout,clearTimeout});
  function render(){cursor=0;tree=module.exports.default();for(const effect of pendingEffects.splice(0))effect();return tree;}
  function nodes(node){if(!node||typeof node!=='object')return [];return [node,...(node.props?.children??[]).flat(Infinity).flatMap(child=>nodes(child))];}
  function text(node){return (node?.props?.children??[]).flat(Infinity).map(child=>typeof child==='object'?text(child):child??'').join('');}
  render();
  return {render,nodes:()=>nodes(tree),text,plays,requests,bridge,find:predicate=>nodes(tree).find(predicate),button:label=>nodes(tree).find(node=>node.type==='button'&&text(node)===label),unmount(){for(const slot of slots)slot?.cleanup?.();slots=[];}};
}

test('guest entry plays the authored example directly and offers no unavailable seed form',()=>{
  const ui=receiver();
  assert.equal(ui.find(node=>node.type==='textarea'),undefined);
  assert.ok(ui.button('Play example'));
  ui.button('Play example').props.onClick();ui.render();
  assert.equal(ui.plays.length,1);assert.equal(ui.requests.length,0);
  assert.equal(ui.plays[0][0].title,FIRST_CONTACT.title);
  assert.ok(ui.button('Edit this cut'));assert.ok(ui.button('Export script'));assert.ok(ui.button('Capture 28 seconds'));
});

test('owner without a live connection sees the access requirement before any seed input',()=>{
  for(const kind of ['locked','demo','loading','offline']){
    const ui=receiver({owner:true,kind});
    assert.equal(ui.find(node=>node.type==='textarea'),undefined);
    assert.ok(ui.button(kind==='locked'?'Owner sign-in':'Connection settings'));
  }
});

test('unsubmitted seed and tone survive an internal route unmount and authored example playback',()=>{
  const ui=receiver({owner:true});
  ui.find(node=>node.props?.id==='afterimage-seed').props.onChange({target:{value:'My unsubmitted thought'}});
  ui.button('Wonder').props.onClick();ui.render();
  ui.button('Play example').props.onClick();ui.render();ui.unmount();ui.render();
  assert.equal(ui.find(node=>node.props?.id==='afterimage-seed').props.value,'My unsubmitted thought');
  assert.equal(ui.button('Wonder').props['aria-pressed'],true);
});

test('cancelled and failed generation preserve the existing story and seed',async()=>{
  let pending;
  const ui=receiver({owner:true,receive:()=>new Promise((resolve,reject)=>{pending={resolve,reject};})});
  ui.find(node=>node.props?.id==='afterimage-seed').props.onChange({target:{value:'Keep this seed'}});ui.render();
  const title=ui.text(ui.find(node=>node.props?.className==='reception-title'));
  const first=ui.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});ui.render();
  ui.button('Cancel generation').props.onClick();ui.render();
  assert.equal(ui.requests[0].signal.aborted,true);
  pending.reject(Object.assign(Error('aborted'),{name:'AbortError'}));await first;ui.render();
  const second=ui.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});ui.render();
  pending.reject(Error('Provider unavailable'));await second;ui.render();
  assert.equal(ui.find(node=>node.props?.id==='afterimage-seed').props.value,'Keep this seed');
  assert.equal(ui.text(ui.find(node=>node.props?.className==='reception-title')),title);
  assert.equal(ui.text(ui.find(node=>node.props?.role==='alert')),'Provider unavailable');
});

test('capture format follows the shared bridge selection and updates the exported dimensions',()=>{
  const ui=receiver({exportProfile:'portrait'});
  const select=()=>ui.find(node=>node.type==='select'&&node.props.id==='afterimage-export-profile');
  assert.ok(select(),'capture format must be available before recording');
  assert.equal(select().props.value,'portrait');
  assert.deepEqual(ui.nodes().filter(node=>node.type==='option').map(node=>node.props.value),['landscape','portrait','square']);
  select().props.onChange({target:{value:'square'}});ui.render();
  assert.equal(ui.bridge.snapshot().exportProfile,'square');
  assert.equal(select().props.value,'square');
  assert.match(ui.text(ui.find(node=>node.props?.id==='afterimage-capture-note')),/1080 × 1080/);
  ui.bridge.setExportProfile('landscape');ui.render();
  assert.equal(select().props.value,'landscape');
});

test('capture format is locked while recording but remains available for the next rehearsal cut',()=>{
  const recording=receiver({recording:true});
  const select=recording.find(node=>node.props?.id==='afterimage-export-profile');
  assert.ok(select);assert.equal(select.props.disabled,true);
  const rehearsal=receiver();rehearsal.button('Play this cut').props.onClick();rehearsal.render();
  assert.equal(rehearsal.find(node=>node.props?.id==='afterimage-export-profile').props.disabled,false);
});
