import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import {createKnowledge} from '../public/js/knowledge.js';

const root=path.resolve(import.meta.dirname,'..'),nativeRequire=createRequire(import.meta.url);
// Expose the existing component in the test bundle; its production mount stays unchanged.
const bundle=await build({entryPoints:[path.join(root,'client/workspace.jsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'transform',plugins:[{name:'notebook-harness',setup(builder){
  builder.onLoad({filter:/client[\\/]workspace\.jsx$/},async args=>({contents:`${await readFile(args.path,'utf8')}\nexport {Notebook};`,loader:'jsx'}));
  builder.onResolve({filter:/^(react|react-dom|react-dom\/client|motion\/react|\/js\/)/},args=>({path:args.path,external:true}));
  builder.onResolve({filter:/(source-scene|source-boundary|afterimage|companion-hub)\.jsx$/},args=>({path:args.path,external:true}));
}}]});

function notebook({owner=false,enabled=true,initialRaw}={}) {
  const data=new Map(initialRaw===undefined?[]:[['nox.knowledge.v1',initialRaw]]),downloads=[],storage={temporary:!owner,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  const knowledge=createKnowledge(storage);knowledge.setEnabled(enabled);
  const slots=[];let cursor=0,tree;
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),Suspense:'suspense',lazy:()=> 'lazy',useCallback:fn=>fn,useRef:value=>({current:value}),useEffect(){},useState(initial){const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value;}];}};
  const mocks={'react':react,'react-dom':{createPortal:children=>children},'react-dom/client':{},'motion/react':{AnimatePresence:'presence',motion:{article:'article'},useReducedMotion:()=>false},'/js/workbench.js':{knowledge,knowledgeChanged(){},downloadText:(...args)=>downloads.push(args)},'/js/visit-scope.js':{visit:{owner,storage}},'/js/preferences.js':{readTheme:()=> 'dark',applyTheme(){}},'/js/source-background.js':{},'./source-boundary.jsx':{},'./companion-hub.jsx':{mountCompanionHub(){}}};
  const module={exports:{}};
  vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,require:id=>mocks[id]??nativeRequire(id),document:{getElementById:()=>null},console});
  function render(){cursor=0;tree=module.exports.Notebook();return tree;}
  function nodes(node){if(!node||typeof node!=='object')return [];return [node,...(node.props?.children??[]).flat(Infinity).flatMap(child=>nodes(child))];}
  function text(node){return (node?.props?.children??[]).flat(Infinity).map(child=>typeof child==='object'?text(child):child??'').join('');}
  const find=predicate=>nodes(tree).find(predicate);render();
  return {knowledge,storage,downloads,render,find,text,status:()=>text(find(node=>node.props?.role==='status'))};
}

test('a protected notebook offers its exact original and requires explicit replacement',async()=>{
  const raw=' {"version":99,"valuable":"Original notebook"} ',ui=notebook({owner:true,initialRaw:raw});
  const button=label=>ui.find(node=>node.type==='button'&&ui.text(node)===label);
  button('Download original notebook').props.onClick();assert.equal(ui.downloads[0][0],raw);
  button('Replace protected notebook').props.onClick();ui.render();assert.equal(ui.storage.getItem('nox.knowledge.v1'),raw);
  await button('Confirm notebook replacement').props.onClick();ui.render();
  assert.equal(JSON.parse(ui.storage.getItem('nox.knowledge.v1')).version,1);assert.equal(ui.knowledge.recovery,null);
});

test('notebook recovery confirmation keeps a changed original and the current pasted draft',async()=>{
  const raw='{broken',ui=notebook({owner:true,initialRaw:raw}),button=label=>ui.find(node=>node.type==='button'&&ui.text(node)===label);
  ui.find(node=>node.props?.id==='knowledge-text').props.onChange({target:{value:'Keep my unfinished note'}});
  button('Replace protected notebook').props.onClick();ui.render();
  const changed='{"version":2,"valuable":"Other tab"}';ui.storage.setItem('nox.knowledge.v1',changed);
  await button('Confirm notebook replacement').props.onClick();ui.render();
  assert.equal(ui.storage.getItem('nox.knowledge.v1'),changed);assert.match(ui.status(),/changed|could not/);
  assert.equal(ui.find(node=>node.props?.id==='knowledge-text').props.value,'Keep my unfinished note');
});

test('guest note submission confirms temporary storage and tells the guest how to use the passage',async()=>{
  const ui=notebook();
  ui.find(node=>node.props?.id==='knowledge-title').props.onChange({target:{value:'A guest note'}});
  ui.find(node=>node.props?.id==='knowledge-text').props.onChange({target:{value:'Use this text in our discussion.'}});ui.render();
  await ui.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});ui.render();
  assert.equal(ui.knowledge.list()[0].title,'A guest note');assert.equal(ui.knowledge.persistent,false);
  assert.match(ui.status(),/this visit/);assert.match(ui.status(),/relevant passages can accompany/i);
  const context=ui.find(node=>node.type==='input'&&node.props.type==='checkbox');
  assert.equal(context.props.disabled,false);assert.equal(context.props.checked,true);
});

test('guest file import gives the same temporary-use guidance as pasted notes',async()=>{
  const ui=notebook();
  await ui.find(node=>node.props?.id==='knowledge-file').props.onChange({target:{files:[{name:'guest.md',size:20,text:async()=> 'A temporary text file.'}],value:'guest.md'}});ui.render();
  assert.equal(ui.knowledge.list()[0].title,'guest.md');assert.match(ui.status(),/this visit/);assert.match(ui.status(),/relevant passages can accompany/i);
});

test('an owner with notebook context off is told to enable it after saving',async()=>{
  const ui=notebook({owner:true,enabled:false});
  ui.find(node=>node.props?.id==='knowledge-title').props.onChange({target:{value:'Owner note'}});
  ui.find(node=>node.props?.id==='knowledge-text').props.onChange({target:{value:'A project brief.'}});ui.render();
  await ui.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});ui.render();
  assert.equal(ui.knowledge.persistent,true);assert.match(ui.status(),/turn on notebook context/i);
});

test('a recovered owner storage write reports its final persisted state',async()=>{
  const ui=notebook({owner:true});const write=ui.storage.setItem;
  ui.storage.setItem=()=>{throw Error('Storage full');};
  assert.throws(()=>ui.knowledge.add({title:'Rejected',text:'This should not save.'}));
  ui.storage.setItem=write;
  ui.find(node=>node.props?.id==='knowledge-title').props.onChange({target:{value:'Recovered note'}});
  ui.find(node=>node.props?.id==='knowledge-text').props.onChange({target:{value:'This is saved now.'}});ui.render();
  await ui.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});ui.render();
  assert.equal(ui.knowledge.persistent,true);assert.match(ui.status(),/note saved/i);
  assert.doesNotMatch(ui.status(),/this visit/);
});

for(const owner of [false,true])test(`${owner?'owner':'guest'} note deletion waits for confirmation and Cancel keeps the complete note`,async()=>{
  const ui=notebook({owner});ui.find(node=>node.props?.id==='knowledge-title').props.onChange({target:{value:'Only copy'}});ui.find(node=>node.props?.id==='knowledge-text').props.onChange({target:{value:'Keep the complete original.'}});ui.render();await ui.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});ui.render();
  ui.find(node=>node.props?.['aria-label']==='Delete note Only copy').props.onClick();ui.render();
  assert.equal(ui.knowledge.list()[0].text,'Keep the complete original.');
  const button=label=>ui.find(node=>node.type==='button'&&ui.text(node)===label);
  button('Keep note').props.onClick();ui.render();assert.equal(ui.knowledge.list().length,1);
  ui.find(node=>node.props?.['aria-label']==='Delete note Only copy').props.onClick();ui.render();
  await button('Delete note').props.onClick();ui.render();assert.equal(ui.knowledge.list().length,0);
});

test('failed confirmed note deletion keeps its note visible and reports failure',async()=>{
  const ui=notebook({owner:true});ui.find(node=>node.props?.id==='knowledge-title').props.onChange({target:{value:'Only copy'}});ui.find(node=>node.props?.id==='knowledge-text').props.onChange({target:{value:'Keep my note.'}});ui.render();await ui.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});ui.render();
  ui.find(node=>node.props?.['aria-label']==='Delete note Only copy').props.onClick();ui.render();
  ui.storage.setItem=()=>{throw Error('Blocked');};await ui.find(node=>node.type==='button'&&ui.text(node)==='Delete note').props.onClick();ui.render();
  assert.equal(ui.knowledge.list()[0].text,'Keep my note.');assert.match(ui.status(),/could not|storage/i);assert.doesNotMatch(ui.status(),/note deleted/i);
});
