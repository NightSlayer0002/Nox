import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import {createExploreState,createGuessingState,updateGuessingState} from '../shared/everyday-activities.js';

const root=path.resolve(import.meta.dirname,'..'),nativeRequire=createRequire(import.meta.url);
const bundle=await build({entryPoints:[path.join(root,'public/js/companion-context.js')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'visit-context-harness',setup(builder){builder.onResolve({filter:/visit-scope\.js$/},()=>({path:'test-visit',external:true}));}}]});
function context(){
  const writes=[],values=new Map(),module={exports:{}};
  const disk={getItem:key=>values.get(key)??null,setItem:(key,value)=>{writes.push(key);values.set(key,value);}};
  vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,require:id=>id==='test-visit'?{visit:{owner:false}}:nativeRequire(id),structuredClone,TextEncoder,localStorage:disk});
  return {...module.exports,writes};
}

test('latest learning and guessing snapshots retain their own id and state only within the visit',()=>{
  const session=context(),explore={...createExploreState(),topic:'Why do shadows move?',angle:217,teachBack:'The viewing angle changes.',selfCheck:['view']};
  let guessing=createGuessingState({seed:10});guessing=updateGuessingState(guessing,{type:'question',id:'rain'});guessing=updateGuessingState(guessing,{type:'hint'});
  session.rememberActivity('explore',{id:'learning-round',state:explore});session.rememberActivity('guessing',{id:'guessing-round',state:guessing});
  assert.equal(session.getActivity('explore').id,'learning-round');assert.deepEqual(session.getActivity('explore').state,explore);
  assert.equal(session.getActivity('guessing').id,'guessing-round');assert.deepEqual(session.getActivity('guessing').state,guessing);
  assert.deepEqual(session.writes,[]);assert.equal(context().getActivity('explore'),null);assert.equal(context().getActivity('guessing'),null);
});

test('visit cache copies inputs and reads so navigation consumers cannot mutate the retained state',()=>{
  const session=context(),input={id:'activity-learning',state:createExploreState()};session.rememberActivity('explore',input);
  input.state.angle=300;input.state.selfCheck.push('light');const read=session.getActivity('explore');read.state.angle=90;
  assert.equal(session.getActivity('explore').state.angle,45);assert.deepEqual(session.getActivity('explore').state.selfCheck,[]);
  assert.equal(session.rememberActivity('other',input),null);assert.equal(session.getActivity('other'),null);
  assert.equal(session.rememberActivity('guessing',input),null);assert.equal(session.getActivity('guessing'),null);
});

test('consuming an explicitly opened save replaces visit state, retaining its saved id and safe copies',()=>{
  const session=context();session.rememberActivity('explore',{id:'unsaved-visit',state:{...createExploreState(),angle:90}});
  const save={id:'deliberately-kept',kind:'explore',title:'Moon',state:{...createExploreState(),angle:180,topic:'Saved topic',teachBack:'Saved explanation'}};
  session.queueSavedOpen(save);save.state.angle=0;
  assert.equal(session.getActivity('explore').id,'unsaved-visit');
  const opened=session.takeSavedOpen('explore');assert.equal(opened.id,'deliberately-kept');assert.equal(opened.state.angle,180);
  assert.equal(session.getActivity('explore').id,'deliberately-kept');assert.equal(session.getActivity('explore').state.teachBack,'Saved explanation');
  opened.state.angle=270;assert.equal(session.getActivity('explore').state.angle,180);assert.equal(session.takeSavedOpen('explore'),null);
  session.queueSavedOpen({id:'cut',kind:'afterimage',state:{packet:{title:'Unrelated story'}}});assert.equal(session.takeSavedOpen('afterimage').id,'cut');
  assert.equal(session.getActivity('explore').state.angle,180);assert.deepEqual(session.writes,[]);
});
