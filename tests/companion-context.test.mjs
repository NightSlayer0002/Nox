import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import {createAdaptivePreferences} from '../public/js/adaptive-preferences.js';
import {createVisitScope} from '../public/js/visit-storage.js';
import {createExploreState,createGuessingState,updateGuessingState} from '../shared/everyday-activities.js';

const root=path.resolve(import.meta.dirname,'..'),nativeRequire=createRequire(import.meta.url);
const bundle=await build({entryPoints:[path.join(root,'public/js/companion-context.js')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'visit-context-harness',setup(builder){builder.onResolve({filter:/adaptive-preferences\.js$/},()=>({path:'test-prefs',external:true}));builder.onResolve({filter:/visit-scope\.js$/},()=>({path:'test-visit',external:true}));}}]});
function context({owner=false}={}){
  const writes=[],reads=[],values=new Map(),module={exports:{}};
  const disk={getItem:key=>{reads.push(key);return values.get(key)??null;},setItem:(key,value)=>{writes.push(key);values.set(key,value);}};
  vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,require:id=>id==='test-prefs'?{createAdaptivePreferences}:id==='test-visit'?{visit:createVisitScope({owner,storage:disk})}:nativeRequire(id),structuredClone,TextEncoder,crypto,Object,Date,localStorage:disk});
  return {...module.exports,writes,reads};
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

// The regression is a guest preference escaping visit.storage into localStorage.
test('guest preferences apply inside the visit and vanish in a new visit without reading or writing device data',async()=>{
  const session=context(),proposal=session.approvedPreferences.propose('Keep your answers shorter.','general');
  assert.ok(await session.approvedPreferences.approve(proposal));
  assert.equal(session.approvedPreferences.context('general').answerLength,'short');
  assert.deepEqual(session.reads,[]);assert.deepEqual(session.writes,[]);
  assert.deepEqual(context().approvedPreferences.list(),[]);
});

test('the private developer preferences remain separate and persistent',async()=>{
  const session=context({owner:true}),proposal=session.approvedPreferences.propose('Keep your answers shorter.','general');
  assert.ok(await session.approvedPreferences.approve(proposal));
  assert.ok(session.writes.some(key=>key.startsWith('nox.owner.release.')));
});
