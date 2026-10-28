import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import path from 'node:path';

const html=await readFile(new URL('../public/app.html',import.meta.url),'utf8');
const attributes=text=>new Map([...text.matchAll(/\s([\w-]+)(?:="([^"]*)")?/g)].map(([,name,value])=>[name,value??'']));

for(const [id,name] of [['inside-dialog','Settings'],['clip-dialog','Your clip']])test(`${name} dialog is explicitly named by its visible heading`,()=>{
  // Question: Does the dialog's name reference resolve to its own unique heading?
  // Limit: Static HTML IDREF wiring, not a browser accessibility tree or screen-reader session.
  const dialog=[...html.matchAll(/<dialog\b([^>]*)>([\s\S]*?)<\/dialog>/g)].find(([,attrs])=>attributes(attrs).get('id')===id);
  assert.ok(dialog,`Missing ${id}`);
  const labels=(attributes(dialog[1]).get('aria-labelledby')||'').trim().split(/\s+/).filter(Boolean);
  assert.ok(labels.length,'the visible heading must explicitly name its dialog');
  const headings=[...dialog[2].matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/g)];
  const resolved=labels.map(label=>{
    const matches=headings.filter(([,attrs])=>attributes(attrs).get('id')===label);
    assert.equal(matches.length,1,'the referenced heading must be inside this dialog');
    assert.equal([...html.matchAll(/\sid="([^"]*)"/g)].filter(([,value])=>value===label).length,1,'the heading ID must be unique');
    assert.equal(attributes(matches[0][1]).has('hidden'),false);
    return matches[0][2].replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
  }).join(' ');
  assert.equal(resolved,name);
});

const nativeRequire=createRequire(import.meta.url);
const bundle=await build({entryPoints:[path.resolve(import.meta.dirname,'../client/companion-hub.jsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'transform',plugins:[{name:'preference-accessibility-harness',setup(builder){
  builder.onLoad({filter:/client[\\/]companion-hub\.jsx$/},async args=>({contents:`${await readFile(args.path,'utf8')}\nexport {PreferenceConfirmation};`,loader:'jsx'}));
  builder.onResolve({filter:/^(react|react-dom\/client|\/js\/)/},args=>({path:args.path,external:true}));
  builder.onResolve({filter:/everyday-activities\.jsx$/},()=>({path:'test-activity-chunk',external:true}));
}}]});

function confirmation({owner=false,approveResult=true}={}){
  const listeners=new Map(),slots=[],approvals=[];let cursor=0,tree,changes=0;const pendingEffects=[];
  const composer={value:'Keep this unrelated draft.',focus(){document.activeElement=this;}};
  const document={activeElement:composer,getElementById:()=>composer,querySelector:()=>composer};
  const window={addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener);},removeEventListener(type,listener){listeners.get(type)?.delete(listener);}};
  const react={Component:class{},Fragment:Symbol('Fragment'),Suspense:Symbol('Suspense'),lazy:()=>()=>null,createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(initial){const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value;}];},useEffect(effect,deps){const index=cursor++,previous=slots[index];if(!previous||deps.some((value,i)=>value!==previous.deps[i]))pendingEffects.push(()=>{previous?.cleanup?.();slots[index]={deps,cleanup:effect()};});}};
  const mocks={'react':react,'react-dom/client':{},'/js/visit-scope.js':{visit:{owner}},'/js/companion-context.js':{approvedPreferences:{approve:async proposal=>{approvals.push(proposal);return approveResult;}},companionBridge:{preferenceChanged(){changes++;}}}};
  const module={exports:{}};
  vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,require:id=>mocks[id]??nativeRequire(id),window,document,console});
  function render(){cursor=0;tree=module.exports.PreferenceConfirmation();for(const effect of pendingEffects.splice(0))effect();}
  const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'?[node,...nodes(node.props?.children)]:[];
  const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):String(node??'');
  render();
  return {render,nodes:()=>nodes(tree),text,composer,document,approvals,get changes(){return changes;},find:predicate=>nodes(tree).find(predicate),offer(proposal){for(const listener of listeners.get('nox:preference-proposal')||[])listener({detail:proposal});render();},button:label=>nodes(tree).find(node=>node.type==='button'&&text(node)===label),unmount(){for(const slot of slots)slot?.cleanup?.();}};
}

const proposal={id:'candidate',key:'learningStyle',value:'hints',scope:'learning',origin:'One clue at a time',label:'When learning'};

for(const owner of [false,true])test(`${owner?'owner':'guest'} preference proposal is announced and exposes a keyboard-reachable Preferences link without taking focus`,()=>{
  // Question: Does a new proposal expose its value/scope and a native review route without approving it or disturbing input?
  // Limit: Real component handlers with a hook/tree fixture; native Tab order, CSS visibility, routing and actual AT announcements are not executed.
  const ui=confirmation({owner});
  const status=()=>ui.find(node=>node.props?.role==='status');
  assert.ok(status(),'the live region must exist before the proposal arrives');assert.equal(ui.text(status()),'');
  ui.offer(proposal);
  assert.equal(status().props['aria-live'],'polite');assert.equal(String(status().props['aria-atomic']),'true');
  assert.match(ui.text(status()),/When learning.*Hints first/);assert.match(ui.text(status()),/Only for learning/);
  const review=ui.find(node=>node.type==='a'&&node.props.href==='#memory');assert.ok(review);
  assert.match(ui.text(review),/Review all preferences/i);assert.ok(review.props.tabIndex===undefined||Number(review.props.tabIndex)>=0);assert.equal(Boolean(review.props.hidden),false);assert.notEqual(String(review.props['aria-hidden']),'true');
  assert.ok(ui.find(node=>node.type==='aside'&&node.props['aria-label']==='Approve a preference'));
  assert.ok(ui.button(owner?'Remember this':'Apply for this visit'));assert.ok(ui.button('Not now'));
  assert.deepEqual(ui.approvals,[]);assert.equal(ui.changes,0);assert.equal(ui.document.activeElement,ui.composer);assert.equal(ui.composer.value,'Keep this unrelated draft.');
  assert.equal(ui.nodes().some(node=>node.props.autoFocus),false);ui.unmount();
});

test('a failed preference approval retains the proposal and review route, while Not now dismisses it without applying',async()=>{
  // Question: Are the proposal and review controls recoverable after rejection, with a non-applying dismissal?
  // Limit: The approval adapter returns false; real storage failure, native button focus and focus restoration after removal are outside this fixture.
  const ui=confirmation({approveResult:false});ui.offer(proposal);
  await ui.button('Apply for this visit').props.onClick();ui.render();
  assert.match(ui.text(ui.find(node=>node.props?.role==='alert')),/could not be applied/i);
  assert.ok(ui.find(node=>node.type==='a'&&node.props.href==='#memory'));assert.ok(ui.button('Apply for this visit'));assert.equal(ui.approvals.length,1);assert.equal(ui.changes,0);
  ui.button('Not now').props.onClick();ui.render();
  assert.equal(ui.find(node=>node.type==='aside'),undefined);assert.equal(ui.text(ui.find(node=>node.props?.role==='status')),'');assert.equal(ui.approvals.length,1);assert.equal(ui.changes,0);ui.unmount();
});
