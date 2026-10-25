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
  builder.onResolve({filter:/^\/js\/(afterimage-bridge|visit-scope|workbench|companion-context)\.js$/},args=>({path:args.path,external:true}));
  builder.onResolve({filter:/^\/js\//},args=>({path:path.join(root,'public',args.path.slice(1))}));
}}]});

function receiver({owner=false,kind='live',exportProfile='landscape',recording=false,preparing=false,captionsOnly=false,voiceError='',initialRaw,receive=async()=>{throw Error('Unexpected generation');}}={}){
  let slots=[],cursor=0,pendingEffects=[],tree,plays=[],requests=[],state={connected:true,status:preparing?'playing':'idle',preparing,captionsOnly,voiceError,connection:{kind},recordSupported:true,voiceEnabled:false,exportProfile,recording};
  const subscribers=new Set(),data=new Map(initialRaw===undefined?[]:[['nox.afterimage.v1',initialRaw]]),downloads=[],storage={temporary:!owner,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useRef(value){const index=cursor++;return slots[index]??= {current:value};},useState(initial){const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value;}];},useEffect(effect,deps){const index=cursor++,old=slots[index];if(!old||deps.some((value,i)=>value!==old.deps[i])){pendingEffects.push(()=>{old?.cleanup?.();slots[index]={deps,cleanup:effect()};});}},useReducedMotion:()=>false};
  const bridge={snapshot:()=>state,subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn);},stop(){state={...state,status:'stopped'};for(const fn of subscribers)fn();},play(...args){plays.push(args);state={...state,status:'playing'};for(const fn of subscribers)fn();return true;},recordAndPlay(...args){plays.push(args);return true;},receive(options){requests.push(options);return receive(options);},setVoice(value){state={...state,voiceEnabled:value};},setExportProfile(value){state={...state,exportProfile:value};for(const fn of subscribers)fn();}};
  const mocks={'react':react,'react-dom':{createPortal:children=>children},'motion/react':{AnimatePresence:'presence',motion:{div:'motion-div'},useReducedMotion:react.useReducedMotion},'/js/afterimage-bridge.js':{afterimageBridge:bridge},'/js/visit-scope.js':{visit:{owner,storage}},'/js/workbench.js':{downloadText:(...args)=>downloads.push(args)},'/js/companion-context.js':{}};
  const module={exports:{}};
  vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,require:id=>mocks[id]??nativeRequire(id),navigator:{locks:{request:(_,operation)=>Promise.resolve().then(operation)}},window:{innerWidth:1400,matchMedia:()=>({matches:false}),addEventListener(){},removeEventListener(){},dispatchEvent(){}},Event,document:{body:{},getElementById:()=>null},AbortController,Date,console,setTimeout,clearTimeout});
  function render(){cursor=0;tree=module.exports.default();for(const effect of pendingEffects.splice(0))effect();return tree;}
  function nodes(node){if(!node||typeof node!=='object')return [];return [node,...(node.props?.children??[]).flat(Infinity).flatMap(child=>nodes(child))];}
  function text(node){return (node?.props?.children??[]).flat(Infinity).map(child=>typeof child==='object'?text(child):child??'').join('');}
  render();
  return {render,nodes:()=>nodes(tree),text,plays,requests,bridge,storage,downloads,find:predicate=>nodes(tree).find(predicate),button:label=>nodes(tree).find(node=>node.type==='button'&&text(node)===label),unmount(){for(const slot of slots)slot?.cleanup?.();slots=[];}};
}

test('guest entry plays the authored example directly and offers no unavailable seed form',()=>{
  const ui=receiver();
  assert.equal(ui.find(node=>node.type==='textarea'),undefined);
  assert.equal(ui.find(node=>node.props?.className==='receiver-create'),undefined);
  assert.equal(ui.find(node=>node.props?.className==='receiver-archive'),undefined);
  assert.match(ui.nodes().map(node=>ui.text(node)).join(' '),/clear on refresh/);
  assert.ok(ui.button('Play example'));
  ui.button('Play example').props.onClick();ui.render();
  assert.equal(ui.plays.length,1);assert.equal(ui.requests.length,0);
  assert.equal(ui.plays[0][0].title,FIRST_CONTACT.title);
  assert.ok(ui.button('Edit this cut'));assert.ok(ui.button('Export script'));assert.ok(ui.button('Capture performance'));
});

test('a connected owner retains custom generation and the empty archive controls',()=>{
  const ui=receiver({owner:true});
  assert.ok(ui.find(node=>node.props?.id==='afterimage-seed'));
  assert.ok(ui.button('Generate story'));assert.ok(ui.button('Export all stories'));
});

test('repeated example playback and branch edits never fill the story archive',()=>{
  const ui=receiver({owner:true});
  for(let i=0;i<15;i++){ui.bridge.stop();ui.render();ui.button('Play example').props.onClick();ui.render();}
  assert.equal(ui.storage.getItem('nox.afterimage.v1'),null);
  ui.bridge.stop();ui.render();
  ui.find(node=>node.props?.className==='signal-choices').props.children.flat().find(node=>node?.type==='button').props.onClick();ui.render();
  assert.equal(ui.storage.getItem('nox.afterimage.v1'),null);
});

test('protected story archives offer the exact recovery download and explicit replacement',async()=>{
  const raw=' {"version":99,"valuable":"Original story"} ',ui=receiver({owner:true,initialRaw:raw});
  const original=ui.button('Download original stories');assert.ok(original);original.props.onClick();
  assert.equal(ui.downloads[0][0],raw);assert.equal(ui.storage.getItem('nox.afterimage.v1'),raw);
  ui.button('Replace protected archive').props.onClick();ui.render();
  assert.equal(ui.storage.getItem('nox.afterimage.v1'),raw);
  await ui.button('Confirm replacement').props.onClick();ui.render();
  assert.equal(JSON.parse(ui.storage.getItem('nox.afterimage.v1')).version,1);
});

for(const owner of [false,true])test(`${owner?'owner':'guest'} story deletion waits for confirmation and Cancel preserves its contents`,async()=>{
  const raw=JSON.stringify({version:1,receptions:[{id:'saved',createdAt:'2026-10-24T00:00:00.000Z',packet:FIRST_CONTACT,seed:'Only copy',tone:'uncanny',source:'live',signalIndex:0,endingIndex:0}]}),ui=receiver({owner,initialRaw:raw});
  const deletion=()=>ui.find(node=>node.props?.['aria-label']===`Delete reception ${FIRST_CONTACT.title}`);
  deletion().props.onClick();ui.render();assert.equal(ui.storage.getItem('nox.afterimage.v1'),raw);
  ui.button('Keep story').props.onClick();ui.render();assert.equal(ui.storage.getItem('nox.afterimage.v1'),raw);
  deletion().props.onClick();ui.render();await ui.button('Delete story').props.onClick();ui.render();
  assert.deepEqual(JSON.parse(ui.storage.getItem('nox.afterimage.v1')).receptions,[]);
  assert.match(ui.text(ui.find(node=>node.props?.role==='status')),owner?/this browser/:/this visit/);
});

test('failed confirmed story deletion retains its selected content and archive row',async()=>{
  const raw=JSON.stringify({version:1,receptions:[{id:'saved',createdAt:'2026-10-24T00:00:00.000Z',packet:FIRST_CONTACT,seed:'Only copy',tone:'uncanny',source:'live',signalIndex:0,endingIndex:0}]}),ui=receiver({owner:true,initialRaw:raw});
  ui.find(node=>node.props?.['aria-label']===`Delete reception ${FIRST_CONTACT.title}`).props.onClick();ui.render();
  ui.storage.setItem=()=>{throw Error('Blocked');};await ui.button('Delete story').props.onClick();ui.render();
  assert.equal(ui.storage.getItem('nox.afterimage.v1'),raw);assert.equal(ui.text(ui.find(node=>node.props?.className==='reception-title')),FIRST_CONTACT.title);
  assert.ok(ui.find(node=>node.props?.['aria-label']===`Confirm deletion of ${FIRST_CONTACT.title}`));assert.match(ui.text(ui.find(node=>node.props?.role==='alert')),/could not|storage/i);
  assert.doesNotMatch(ui.text(ui.find(node=>node.props?.role==='status')),/removed from/i);
});

test('a generated story whose save fails stays visible and exportable as unsaved visit work',async()=>{
  const ui=receiver({owner:true,receive:async()=>({packet:{...FIRST_CONTACT,title:'Keep this generated cut'},metrics:{provider:'groq',model:'fixture',totalMs:12}})});
  ui.find(node=>node.props?.id==='afterimage-seed').props.onChange({target:{value:'An unsaved generation'}});ui.render();
  ui.storage.setItem=()=>{throw Error('Full');};await ui.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});ui.render();
  assert.equal(ui.text(ui.find(node=>node.props?.className==='reception-title')),'Keep this generated cut');assert.equal(ui.storage.getItem('nox.afterimage.v1'),null);
  assert.match(ui.text(ui.find(node=>node.props?.role==='alert')),/could not|not.*saved/i);assert.match(ui.text(ui.find(node=>node.props?.role==='status')),/export|this visit/i);
  ui.button('Export script').props.onClick();assert.match(ui.downloads[0][0],/Keep this generated cut/);
});

test('voice preparation remains stoppable and captions-only playback explains its fallback',()=>{
  const preparing=receiver({preparing:true});
  assert.ok(preparing.nodes().some(node=>preparing.text(node)==='Preparing voice…'));
  assert.equal(preparing.button('Capture performance').props.disabled,true);assert.ok(preparing.button('Stop'));
  const fallback=receiver({captionsOnly:true,voiceError:'Voice unavailable'});
  assert.match(fallback.text(fallback.find(node=>node.props?.role==='status')),/captions|Voice unavailable/i);
  assert.match(fallback.text(fallback.find(node=>node.props?.id==='afterimage-capture-note')),/28.*60/);
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

test('a changed saved cut preserves the draft and requires review before applying it to the new branch',async()=>{
  const raw=JSON.stringify({version:1,receptions:[{id:'saved',revision:0,createdAt:'2026-10-24T00:00:00.000Z',packet:FIRST_CONTACT,seed:'Only copy',tone:'uncanny',source:'live',signalIndex:0,endingIndex:0}]}),ui=receiver({owner:true,initialRaw:raw});
  ui.button('Edit this cut').props.onClick();ui.render();
  const firstLine=()=>ui.find(node=>node.type==='textarea'&&node.props.maxLength===90);
  firstLine().props.onChange({target:{value:'Keep my original branch draft.'}});ui.render();
  const archive=JSON.parse(raw);archive.receptions[0].signalIndex=1;archive.receptions[0].revision=1;
  const changed=JSON.stringify(archive);ui.storage.setItem('nox.afterimage.v1',changed);
  await ui.button('Apply edits').props.onClick();ui.render();
  assert.equal(ui.storage.getItem('nox.afterimage.v1'),changed);
  assert.equal(firstLine().props.value,'Keep my original branch draft.');
  assert.match(ui.text(ui.find(node=>node.props?.role==='alert')),/another tab|changed/i);
  assert.equal(ui.button('Apply edits').props.disabled,true);
  ui.button('Review saved cut').props.onClick();ui.render();
  assert.equal(firstLine().props.value,'Keep my original branch draft.');
  assert.match(ui.text(ui.find(node=>node.props?.role==='status')),/review|replace/i);
  await ui.button('Apply edits').props.onClick();ui.render();
  const saved=JSON.parse(ui.storage.getItem('nox.afterimage.v1')).receptions[0];
  assert.equal(saved.signalIndex,1);assert.equal(saved.editedLines[0],'Keep my original branch draft.');
});

for(const transition of ['deletion','unsaved generation'])test(`a story conflict is cleared when ${transition} replaces the selected cut`,async()=>{
  const raw=JSON.stringify({version:1,receptions:[{id:'saved',revision:0,createdAt:'2026-10-24T00:00:00.000Z',packet:FIRST_CONTACT,seed:'Only copy',tone:'uncanny',source:'live',signalIndex:0,endingIndex:0}]}),ui=receiver({owner:true,initialRaw:raw,receive:async()=>({packet:{...FIRST_CONTACT,title:'Unsaved new cut'}})});
  ui.button('Edit this cut').props.onClick();ui.render();
  const changed=JSON.parse(raw);changed.receptions[0].revision=1;changed.receptions[0].signalIndex=1;ui.storage.setItem('nox.afterimage.v1',JSON.stringify(changed));
  await ui.button('Apply edits').props.onClick();ui.render();assert.ok(ui.button('Review saved cut'));
  if(transition==='deletion'){
    ui.find(node=>node.props?.['aria-label']===`Delete reception ${FIRST_CONTACT.title}`).props.onClick();ui.render();
    await ui.button('Delete story').props.onClick();ui.render();
  }else{
    ui.storage.setItem=()=>{throw Error('Full');};await ui.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});ui.render();
    assert.equal(ui.text(ui.find(node=>node.props?.className==='reception-title')),'Unsaved new cut');
  }
  assert.equal(ui.button('Review saved cut'),undefined);
  ui.button('Edit this cut').props.onClick();ui.render();
  assert.equal(ui.button('Apply edits').props.disabled,false);
});
