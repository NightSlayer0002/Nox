import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import path from 'node:path';

const nativeRequire=createRequire(import.meta.url);
const bundle=await build({entryPoints:[path.resolve(import.meta.dirname,'../client/companion-hub.jsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'transform',plugins:[{name:'companion-recovery-harness',setup(builder){
  builder.onLoad({filter:/client[\\/]companion-hub\.jsx$/},async args=>({contents:`${await readFile(args.path,'utf8')}\nexport {EverydayRoute,Welcome};`,loader:'jsx'}));
  builder.onResolve({filter:/^(react|react-dom\/client|\/js\/)/},args=>({path:args.path,external:true}));
  builder.onResolve({filter:/everyday-activities\.jsx$/},()=>({path:'test-activity-chunk',external:true}));
}}]});

function hub({hash='#learn',failure=null,owner=false}={}){
  const listeners=new Map(),suspense=Symbol('Suspense');let active,updates=0,reloads=0;
  const window={addEventListener(type,callback){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(callback);},removeEventListener(type,callback){listeners.get(type)?.delete(callback);}};
  const location={hash,reload(){reloads++;}};
  class Component{constructor(props){this.props=props;}}
  const react={Component,Suspense:suspense,createElement:(type,props,...children)=>({type,props:{...props,children}}),lazy:()=>function Activity(){if(failure)throw failure;return react.createElement('article',{'data-activity':'loaded'},'Activity ready.');},useState(initial){const slot={value:typeof initial==='function'?initial():initial};return [slot.value,value=>{slot.value=typeof value==='function'?value(slot.value):value;updates++;}];},useEffect(effect){active.effects.push(effect);}};
  const mocks={'react':react,'react-dom/client':{},'/js/visit-scope.js':{visit:{owner}},'/js/companion-context.js':{approvedPreferences:{context:()=>({})},companionBridge:{snapshot:()=>({})},getActivity:()=>null}};
  const module={exports:{}};
  vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,require:id=>mocks[id]??nativeRequire(id),window,location,console});
  function mount(component){
    const view={effects:[],cleanups:[]};active=view;
    const tree=component();view.cleanups=view.effects.map(effect=>effect());
    return {tree,unmount(){for(const cleanup of view.cleanups)cleanup?.();}};
  }
  // Drive the documented Component/Suspense boundary contracts while retaining
  // the real route and SourceBoundary render logic, as in the other UI tests.
  function render(node){
    if(Array.isArray(node))return node.map(render);
    if(!node||typeof node!=='object')return node;
    if(node.type===suspense){try{return render(node.props.children);}catch(error){if(typeof error?.then==='function')return render(node.props.fallback);throw error;}}
    if(typeof node.type==='function'){
      if(node.type.prototype?.render){
        const instance=new node.type(node.props);
        try{return render(instance.render());}catch(error){if(!node.type.getDerivedStateFromError)throw error;instance.state={...instance.state,...node.type.getDerivedStateFromError(error)};return render(instance.render());}
      }
      return render(node.type(node.props));
    }
    return {...node,props:{...node.props,children:render(node.props.children)}};
  }
  const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'?[node,...nodes(node.props?.children)]:[];
  const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):String(node??'');
  return {mount,components:module.exports,render,nodes,text,location,get reloads(){return reloads;},get updates(){return updates;},count:type=>listeners.get(type)?.size||0,dispatch(type){for(const callback of [...listeners.get(type)||[]])callback();}};
}

for(const [hash,reason] of [['#learn','Chunk returned 404'],['#guessing','Network is offline']]){
  test(`${hash} shows an actionable recovery view for a rejected activity chunk`,()=>{
    const ui=hub({hash,failure:Error(reason)}),view=ui.mount(ui.components.EverydayRoute),tree=ui.render(view.tree);
    const all=ui.nodes(tree),alert=all.find(node=>node.props.role==='alert');
    assert.ok(alert,'chunk rejection must be contained in a readable activity error');
    assert.match(ui.text(alert),/could not load/i);
    assert.match(ui.text(alert),/temporary.*clears|clears.*temporary/i);
    const chat=all.find(node=>node.type==='a'&&node.props.href==='#conversation');
    assert.ok(chat,'chat must remain reachable from the error view');
    const reload=all.find(node=>node.type==='button'&&/reload/i.test(ui.text(node)));
    assert.ok(reload,'rejected module imports need a real reload action');
    reload.props.onClick();assert.equal(ui.reloads,1);
    view.unmount();
  });
}

test('a pending activity still shows its loading notice and a successful chunk renders normally',()=>{
  const pending=hub({failure:new Promise(()=>{})}),view=pending.mount(pending.components.EverydayRoute);
  assert.match(pending.text(pending.render(view.tree)),/Opening your activity/);view.unmount();
  const ready=hub(),loaded=ready.mount(ready.components.EverydayRoute);
  assert.match(ready.text(ready.render(loaded.tree)),/Activity ready/);loaded.unmount();
});

test('companion subscriptions stop updating after unmount and do not accumulate on remount',()=>{
  const ui=hub();
  for(let cycle=0;cycle<3;cycle++){
    const view=ui.mount(ui.components.Welcome),before=ui.updates;
    assert.equal(ui.count('nox:companion-change'),1);
    assert.equal(ui.count('storage'),1);
    ui.dispatch('nox:companion-change');assert.equal(ui.updates,before+1);
    view.unmount();
    assert.equal(ui.count('nox:companion-change'),0);
    assert.equal(ui.count('storage'),0);
    const stopped=ui.updates;ui.dispatch('nox:companion-change');ui.dispatch('storage');
    assert.equal(ui.updates,stopped,'obsolete companion callbacks must not render after unmount');
  }
});
