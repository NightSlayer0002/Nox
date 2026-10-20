import test from 'node:test';
import assert from 'node:assert/strict';
import {GUESS_OBJECTS,GUESS_QUESTIONS,createGuessingState,restoreGuessingState,updateGuessingState,guessingResult,normalizeGameRules,normalizeGuess,createExploreState,restoreExploreState,exploreRecap,moonPhase} from '../shared/everyday-activities.js';
import {createEverydayBridge} from '../public/js/everyday-bridge.js';
import {FIRST_CONTACT} from '../client/afterimage-example.js';
import {buildSelectedPerformance} from '../public/js/afterimage-engine.js';

test('Moon geometry matches new, quarter and full phases, with periodic angles',()=>{
  assert.equal(moonPhase(0).fraction,0);assert.equal(moonPhase(180).fraction,1);
  assert.ok(Math.abs(moonPhase(90).fraction-.5)<1e-12);
  assert.ok(Math.abs(moonPhase(270).fraction-.5)<1e-12);
  assert.equal(moonPhase(450).name,'First quarter');assert.equal(moonPhase(-90).name,'Third quarter');
});
test('Explore restores only bounded authored fields and preserves a real teach-back',()=>{
  const initial=createExploreState({learningStyle:'hints'});assert.equal(initial.approach,'hints');assert.equal(initial.clues,1);
  const saved=restoreExploreState({...initial,topic:'a passage',angle:999,clues:-1,teachBack:'We see a different part of the sunlit half.',selfCheck:['view','view','light','fabricated'],paused:true});
  assert.equal(saved.topic,'a passage');assert.equal(saved.angle,360);assert.equal(saved.clues,0);assert.deepEqual(saved.selfCheck,['view','light']);assert.equal(saved.paused,true);
  assert.equal(exploreRecap(saved).teachBack,saved.teachBack);assert.match(exploreRecap(saved).understood,/You marked/);
  assert.equal(restoreExploreState({version:9,kind:'explore',angle:90}).angle,45);
});
test('game chooses one fixed curated object and answers every supported property honestly',()=>{
  for(let i=0;i<GUESS_OBJECTS.length;i++){
    for(const question of GUESS_QUESTIONS){
      const start=createGuessingState({seed:i});const next=updateGuessingState(start,{type:'question',id:question.id});
      assert.equal(next.targetId,start.targetId);assert.equal(next.turns,1);assert.equal(next.events[0].answer,GUESS_OBJECTS[i].tags.includes(question.id));
    }
  }
});
test('duplicate and unsupported questions do not use turns; wrong and right guesses do',()=>{
  let state=createGuessingState({seed:0});state=updateGuessingState(state,{type:'question',id:'food'});
  assert.equal(updateGuessingState(state,{type:'question',id:'food'}).turns,1);
  assert.equal(updateGuessingState(state,{type:'question',id:'invented'}).turns,1);
  assert.equal(updateGuessingState(state,{type:'guess',value:'an imaginary dragon'}).turns,1);
  state=updateGuessingState(state,{type:'guess',value:'Is it a pencil?'});assert.equal(state.turns,2);assert.equal(state.events.at(-1).answer,false);
  assert.equal(updateGuessingState(state,{type:'guess',value:'pencil'}).turns,2);
  state=updateGuessingState(state,{type:'guess',value:'Could it be an apple?'});assert.equal(state.status,'won');assert.equal(state.turns,3);assert.match(guessingResult(state),/found an apple in 3 turns/);
  assert.equal(updateGuessingState(state,{type:'question',id:'made'}).turns,3);
  assert.equal(normalizeGuess('  My guess is a SPOON!  '),'a spoon');
});
test('hints are optional, have a truthful order and do not consume turns',()=>{
  let state=createGuessingState({seed:2,rules:{questionLimit:5}});
  for(let n=0;n<5;n++)state=updateGuessingState(state,{type:'hint'});
  assert.equal(state.hintsUsed,3);assert.equal(state.turns,0);assert.equal(state.events[2].text,GUESS_OBJECTS[2].hints[2]);
  assert.equal(updateGuessingState(createGuessingState({rules:{hints:false}}),{type:'hint'}).events.length,0);
});
test('turn limit ends the round and offers a truthful result',()=>{
  let state=createGuessingState({seed:0,rules:{questionLimit:5}});
  for(const id of ['food','made','wood','metal','paper'])state=updateGuessingState(state,{type:'question',id});
  assert.equal(state.status,'lost');assert.equal(state.turns,5);assert.match(guessingResult(state),/object was an apple/);
  assert.equal(updateGuessingState(state,{type:'guess',value:'apple'}).status,'lost');
  assert.deepEqual(normalizeGameRules({questionLimit:200,hints:false}),{questionLimit:20,hints:false});
  assert.equal(normalizeGameRules({questionLimit:0}).questionLimit,5);assert.equal(createGuessingState({seed:Infinity}).targetId,'apple');
});
test('pause, JSON restore and resume preserve the same object, turns and hints',()=>{
  let state=createGuessingState({seed:10,rules:{questionLimit:7,hints:true}});
  state=updateGuessingState(state,{type:'question',id:'rain'});state=updateGuessingState(state,{type:'hint'});state=updateGuessingState(state,{type:'pause'});
  const restored=restoreGuessingState(JSON.parse(JSON.stringify(state)));assert.deepEqual(restored,state);
  assert.equal(updateGuessingState(restored,{type:'guess',value:'umbrella'}).status,'paused');
  const resumed=updateGuessingState(restored,{type:'resume'});assert.equal(resumed.targetId,'umbrella');assert.equal(resumed.turns,1);assert.equal(updateGuessingState(resumed,{type:'guess',value:'umbrella'}).status,'won');
});
test('imported outcomes and counters are recomputed from bounded valid events',()=>{
  const forged={...createGuessingState({seed:0,rules:{questionLimit:5}}),turns:-9,hintsUsed:100,status:'won',events:[{type:'question',id:'made',answer:true},{type:'question',id:'made',answer:true},{type:'guess',id:'pencil',answer:true},{type:'question',id:'does-not-exist'}]};
  const safe=restoreGuessingState(forged);assert.equal(safe.status,'playing');assert.equal(safe.turns,2);assert.equal(safe.hintsUsed,0);assert.equal(safe.events[0].answer,false);assert.equal(safe.events[1].answer,false);
  assert.equal(restoreGuessingState({...forged,targetId:'unknown'}).targetId,'apple');
});
test('bridge keeps real model, speech, storage and preference consent outside the UI',async()=>{
  const bridge=createEverydayBridge(),calls=[];assert.throws(()=>bridge.ask('Explain this'),/connecting/);assert.equal(bridge.stop(),undefined);
  const disconnect=bridge.connect({ask:(...args)=>{calls.push(['ask',...args]);return 'opened';},speak:value=>{calls.push(['speak',value]);return true;},stop:()=>calls.push(['stop']),save:value=>{calls.push(['save',value]);return {saved:true};},proposePreference:value=>{calls.push(['proposal',value]);return {approved:false};}});
  assert.equal(await bridge.ask('  Explain this  ',{activity:{kind:'explore'}}),'opened');assert.equal(calls[0][1],'Explain this');
  assert.throws(()=>bridge.ask('x'.repeat(6001)),/too long/);assert.equal(calls.length,1);
  assert.equal(bridge.speak(' A clue. '),true);assert.equal(bridge.speak(''),false);bridge.stop();
  assert.deepEqual(await bridge.proposePreference({key:'gameHints',value:false,scope:'guessing'}),{approved:false});
disconnect();assert.throws(()=>bridge.speak('Hello'),/connecting/);
});
test('activity read-aloud forwards only its bounded activity scope',()=>{
  const bridge=createEverydayBridge(),calls=[];bridge.connect({speak:(...args)=>calls.push(args)});
  for(const activity of ['explore','guessing']){
    bridge.speak(' A clue. ',{activity,credentials:'not a supported speech option'});
    assert.deepEqual(calls.at(-1),['A clue.',{activity}]);
  }
  bridge.speak('Hello',{activity:'invented'});
  assert.deepEqual(calls.at(-1),['Hello',{activity:undefined}]);
});
