import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import {createExploreState,createGuessingState} from '../shared/everyday-activities.js';

const root=path.resolve(import.meta.dirname,'..'),nativeRequire=createRequire(import.meta.url);
const bundle=await build({entryPoints:[path.join(root,'client/everyday-activities.jsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'transform',plugins:[{name:'activity-harness',setup(builder){builder.onResolve({filter:/^(react|\/js\/everyday-bridge\.js)$/},args=>({path:args.path,external:true}));}}]});
function activity(props={}){
  let slots=[],cursor=0,pendingEffects=[],tree;const changes=[],saved=[],closed=[],spoken=[],stops=[],proposed=[],bridge={stop(){stops.push(true);},save:item=>saved.push(item),speak:(...args)=>spoken.push(args),proposePreference:value=>proposed.push(value)};
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useId:()=>`id-${cursor++}`,useRef(value){const index=cursor++;return slots[index]??={current:value};},useState(initial){const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value;}];},useEffect(effect,deps){const index=cursor++,old=slots[index];if(!old||deps.some((value,i)=>value!==old.deps[i]))pendingEffects.push(()=>{old?.cleanup?.();slots[index]={deps,cleanup:effect()};});}};
  const module={exports:{}};vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,require:id=>id==='react'?react:id==='/js/everyday-bridge.js'?{everydayBridge:bridge}:nativeRequire(id),crypto:globalThis.crypto,structuredClone,Date,Math,console});
  function render(){cursor=0;tree=module.exports.default({...props,onStateChange:value=>changes.push(value),onClose:value=>closed.push(value)});for(const effect of pendingEffects.splice(0))effect();return tree;}
  function nodes(node){if(!node||typeof node!=='object')return [];return [node,...(node.props?.children??[]).flat(Infinity).flatMap(child=>nodes(child))];}
  function text(node){return (node?.props?.children??[]).flat(Infinity).map(child=>typeof child==='object'?text(child):child??'').join('');}
  const all=()=>nodes(tree),find=predicate=>all().find(predicate);render();
  return {render,changes,saved,closed,spoken,stops,proposed,all,find,text,button:label=>find(node=>node.type==='button'&&text(node)===label),unmount(){for(const slot of slots)slot?.cleanup?.();slots=[];}};
}

test('a legacy paused lesson opens its existing Moon position and notes without another action',()=>{
  const ui=activity({kind:'explore',initialState:{...createExploreState(),id:'legacy-lesson',angle:217,topic:'Keep this question',teachBack:'We see the sunlit half from different angles.',paused:true}});
  const diagram=ui.find(node=>node.type?.name==='MoonDiagram');
  assert.ok(diagram,'the lesson must open directly instead of a Resume screen');assert.equal(diagram.props.angle,217);
  assert.equal(ui.all().filter(node=>node.type==='textarea')[1].props.value,'We see the sunlit half from different angles.');
  diagram.props.onChange(180);ui.render();assert.equal(ui.changes.at(-1).state.angle,180);assert.equal(ui.changes.at(-1).id,'legacy-lesson');
});

test('a legacy paused guessing round accepts the next question without replacing its progress',()=>{
  const ui=activity({kind:'guessing',initialState:{version:1,kind:'guessing',id:'legacy-round',targetId:'umbrella',rules:{questionLimit:7,hints:true},events:[{type:'question',id:'rain'},{type:'hint'}],turns:1,hintsUsed:1,status:'paused'}});
  const select=ui.find(node=>node.type==='select');assert.ok(select,'the next question must be available without a Resume action');
  select.props.onChange({target:{value:'outdoor'}});ui.render();ui.all().find(node=>node.type==='form').props.onSubmit({preventDefault(){}});ui.render();
  const latest=ui.changes.at(-1);assert.equal(latest.id,'legacy-round');assert.equal(latest.state.targetId,'umbrella');assert.equal(latest.state.turns,2);assert.equal(latest.state.hintsUsed,1);assert.equal(latest.state.events.at(-1).answer,true);
});

test('learning reports visit snapshots for edits and navigation without saving on device',()=>{
  const ui=activity({kind:'explore'}),id=ui.changes.at(-1)?.id;assert.ok(id,'initial visit state must include its stable activity id');
  ui.find(node=>node.type==='textarea').props.onChange({target:{value:'A topic to return to'}});ui.render();
  ui.find(node=>node.type?.name==='MoonDiagram').props.onChange(217);ui.render();
  ui.button('Let me explain it back').props.onClick();ui.render();
  ui.all().filter(node=>node.type==='textarea')[1].props.onChange({target:{value:'We see a changing part of the sunlit half.'}});ui.render();
  ui.button('Back to NOX').props.onClick();ui.unmount();const latest=ui.changes.at(-1);
  assert.equal(latest.id,id);assert.equal(latest.kind,'explore');assert.equal(latest.state.topic,'A topic to return to');assert.equal(latest.state.angle,217);assert.equal(latest.state.teachBack,'We see a changing part of the sunlit half.');assert.deepEqual(ui.saved,[]);
  const reopened=activity({kind:'explore',initialState:{...latest.state,id:latest.id}});
  assert.equal(reopened.changes.at(-1).id,id);assert.deepEqual(reopened.changes.at(-1).state,latest.state);
  reopened.changes.at(-1).state.topic='Changed callback copy';reopened.render();assert.equal(reopened.find(node=>node.type==='textarea').props.value,'A topic to return to');
});

test('guessing navigation retains object and progress while a deliberate new round gets a new id',()=>{
  const ui=activity({kind:'guessing',initialState:{...createGuessingState({seed:10}),id:'same-round'}});
  ui.find(node=>node.type==='select').props.onChange({target:{value:'rain'}});ui.render();
  ui.all().find(node=>node.type==='form').props.onSubmit({preventDefault(){}});ui.render();
  ui.button('Give me a hint · 3 left').props.onClick();ui.render();ui.unmount();const latest=ui.changes.at(-1);
  assert.equal(latest.id,'same-round');assert.equal(latest.state.targetId,'umbrella');assert.equal(latest.state.turns,1);assert.equal(latest.state.hintsUsed,1);
  const reopened=activity({kind:'guessing',initialState:{...latest.state,id:latest.id}});assert.deepEqual(reopened.changes.at(-1).state,latest.state);
  reopened.button('Start a new round').props.onClick();reopened.render();const next=reopened.changes.at(-1);
  assert.notEqual(next.id,'same-round');assert.equal(next.state.turns,0);assert.deepEqual(reopened.saved,[]);
});

for(const [name,first,last] of [['select-all then type 12','1','2'],['clear then type 7','','7']])test(`the next-round turn limit supports ${name} without changing the current round`,()=>{
  const ui=activity({kind:'guessing',initialState:{...createGuessingState({seed:0}),id:'keep-this-round'}}),input=()=>ui.find(node=>node.type==='input'&&node.props.type==='number');
  const original=JSON.stringify(ui.changes.at(-1));
  input().props.onChange({target:{value:first}});ui.render();assert.equal(String(input().props.value),first);
  input().props.onChange({target:{value:String(input().props.value)+last}});ui.render();
  const intended=first+last;assert.equal(String(input().props.value),intended);
  input().props.onBlur?.();ui.render();assert.equal(String(input().props.value),intended);
  assert.equal(JSON.stringify(ui.changes.at(-1)),original);
  ui.button('Start a new round').props.onClick();ui.render();assert.equal(ui.changes.at(-1).state.rules.questionLimit,Number(intended));
});

test('pasted limits and numeric step changes remain editable and apply only to the next round',()=>{
  const ui=activity({kind:'guessing',initialState:{...createGuessingState({seed:0}),id:'original'}}),input=()=>ui.find(node=>node.type==='input'&&node.props.type==='number');
  for(const value of ['20','19','20','5']){
    input().props.onChange({target:{value}});ui.render();input().props.onBlur?.();ui.render();
    assert.equal(String(input().props.value),value);assert.equal(ui.changes.at(-1).state.rules.questionLimit,10);
  }
  ui.button('Start a new round').props.onClick();ui.render();assert.equal(ui.changes.at(-1).state.rules.questionLimit,5);
});

test('invalid turn-limit drafts remain visible with an associated error after blur',()=>{
  for(const value of ['','4','21','7.5']){
    const ui=activity({kind:'guessing',initialState:{...createGuessingState({seed:0}),id:'original'}}),input=()=>ui.find(node=>node.type==='input'&&node.props.type==='number');
    const original=JSON.stringify(ui.changes.at(-1));input().props.onChange({target:{value}});ui.render();input().props.onBlur?.();ui.render();
    assert.equal(String(input().props.value),value);assert.equal(JSON.stringify(ui.changes.at(-1)),original);
    assert.equal(input().props['aria-invalid'],true);
    assert.ok(input().props['aria-describedby']);const error=ui.find(node=>node.props?.id===input().props['aria-describedby']);assert.equal(error?.props.role,'alert');assert.match(ui.text(error),/whole number.*5.*20/i);
    input().props.onChange({target:{value:'7'}});ui.render();input().props.onBlur?.();ui.render();
    assert.notEqual(input().props['aria-invalid'],true);assert.equal(ui.find(node=>node.props?.role==='alert'),undefined);
  }
});

for(const finished of [false,true])test(`an invalid limit cannot ${finished?'replace a finished round':'start a new round'} until corrected`,()=>{
  const initialState={...createGuessingState({seed:0}),id:'keep-original',...(finished?{events:[{type:'guess',id:'apple'}]}:{})};
  const ui=activity({kind:'guessing',initialState}),input=()=>ui.find(node=>node.type==='input'&&node.props.type==='number'),button=finished?'Play another round':'Start a new round',original=JSON.stringify(ui.changes.at(-1));
  input().props.onChange({target:{value:'21'}});ui.render();ui.button(button).props.onClick();ui.render();
  assert.equal(JSON.stringify(ui.changes.at(-1)),original);assert.equal(ui.stops.length,0);assert.equal(String(input().props.value),'21');
  assert.match(ui.text(ui.find(node=>node.props?.role==='alert')),/whole number.*5.*20/i);
  input().props.onChange({target:{value:'12'}});ui.render();ui.button(button).props.onClick();ui.render();
  assert.notEqual(ui.changes.at(-1).id,'keep-original');assert.equal(ui.changes.at(-1).state.rules.questionLimit,12);
  assert.equal(ui.find(node=>node.props?.role==='alert'),undefined);
});

test('turn-limit preference proposals validate the draft and submit a number without changing the current round',async()=>{
  const ui=activity({kind:'guessing',initialState:{...createGuessingState({seed:0}),id:'original'}}),input=()=>ui.find(node=>node.type==='input'&&node.props.type==='number'),original=JSON.stringify(ui.changes.at(-1));
  input().props.onChange({target:{value:''}});ui.render();await ui.button('Offer turn limit as my preference').props.onClick();ui.render();
  assert.deepEqual(ui.proposed,[]);assert.equal(String(input().props.value),'');assert.match(ui.text(ui.find(node=>node.props?.role==='alert')),/whole number.*5.*20/i);
  input().props.onChange({target:{value:'12'}});ui.render();await ui.button('Offer turn limit as my preference').props.onClick();ui.render();
  assert.equal(ui.proposed.length,1);assert.equal(ui.proposed[0].key,'gameQuestionLimit');assert.equal(ui.proposed[0].value,12);assert.equal(ui.proposed[0].scope,'guessing');
  assert.equal(JSON.stringify(ui.changes.at(-1)),original);assert.equal(ui.find(node=>node.props?.role==='alert'),undefined);
});

test('Read aloud identifies the current local activity for scoped speech preferences',()=>{
  for(const kind of ['explore','guessing']){
    const ui=activity({kind}),before=JSON.stringify(ui.changes.at(-1));ui.button('Read aloud').props.onClick();
    assert.equal(ui.spoken.length,1);assert.ok(ui.spoken[0][0]);assert.equal(ui.spoken[0][1]?.activity,kind);
    ui.button('Stop voice').props.onClick();ui.render();assert.equal(ui.stops.length,1);assert.equal(JSON.stringify(ui.changes.at(-1)),before);
  }
});
