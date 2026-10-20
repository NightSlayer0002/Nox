import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainMotion,advanceTerrain} from '../public/js/source-terrain.js';

const settle=(input,seconds=4)=>{let state=createTerrainMotion();for(let frame=0;frame<seconds*24;frame++)state=advanceTerrain(state,input,1/24);return state;};

test('the terrain deforms and drifts while idle within a bounded physical envelope',()=>{
  let state=createTerrainMotion();const first=advanceTerrain(state,{},0);
  for(let frame=0;frame<24*90;frame++){
    state=advanceTerrain(state,{},1/24);
    assert.ok(Math.abs(state.x)<.36&&Math.abs(state.y)<.15);
    assert.ok(Math.abs(state.turn)<.05);
    assert.ok(state.strength>=3.2&&state.strength<=4.1);
  }
  assert.ok(state.time>80);
  assert.notEqual(state.x,first.x);
  assert.notEqual(state.density,first.density);
});

test('each eight-second idle passage has visible material travel without a brightness pulse',()=>{
  let state=createTerrainMotion();
  for(let passage=0;passage<12;passage++){
    let travel=0,strengthMin=Infinity,strengthMax=-Infinity,densityMin=Infinity,densityMax=-Infinity;
    for(let frame=0;frame<8*24;frame++){
      const next=advanceTerrain(state,{},1/24);
      const step=Math.hypot(next.x-state.x,next.y-state.y);
      assert.ok(step<.004,'idle material moves smoothly at the 24fps budget');
      travel+=step;strengthMin=Math.min(strengthMin,next.strength);strengthMax=Math.max(strengthMax,next.strength);
      densityMin=Math.min(densityMin,next.density);densityMax=Math.max(densityMax,next.density);
      state=next;
    }
    assert.ok(travel>.14,'the field must visibly travel inside an ordinary viewing interval');
    assert.ok(strengthMax-strengthMin>.06||densityMax-densityMin>.04,'ridges must deform as well as translate');
    assert.ok(!('brightness' in state)&&!('opacity' in state));
  }
});

test('pointer and scroll guide the same terrain without an instant camera jump',()=>{
  const initial=createTerrainMotion(),input={pointerX:1,pointerY:-1,scroll:1,scrollImpulse:1};
  const first=advanceTerrain(initial,input,1/24),settled=settle(input);
  assert.ok(first.pointerX>0&&first.pointerX<.2);
  assert.ok(settled.pointerX>.95&&settled.pointerY<-.95);
  const idle=settle({});
  assert.ok(settled.x>idle.x+.12);
  assert.ok(settled.y<idle.y-.025);
  assert.ok(Math.abs(settled.turn-idle.turn)<.035);
});

test('thinking, voice and typing change deformation without a brightness signal',()=>{
  const idle=settle({}),thinking=settle({activity:'thinking'}),speaking=settle({voice:'speaking'}),typing=settle({typing:1});
  assert.ok(thinking.energy>idle.energy&&speaking.energy>thinking.energy);
  assert.ok(typing.energy>idle.energy);
  assert.ok(speaking.time>thinking.time&&thinking.time>idle.time);
  assert.ok(thinking.strength>idle.strength);
  assert.ok(!('brightness' in speaking)&&!('opacity' in speaking));
  let released=speaking;for(let frame=0;frame<24*5;frame++)released=advanceTerrain(released,{},1/24);
  assert.ok(released.energy<.01);
});

test('reduced motion freezes autonomous travel and gives direct static state feedback',()=>{
  let state=settle({}),input={reduced:true,pointerX:1,scroll:1,activity:'thinking'};
  state=advanceTerrain(state,input,1/24);const still={...state};
  for(let frame=0;frame<240;frame++)state=advanceTerrain(state,input,1/24);
  assert.deepEqual(state,still);
  assert.equal(state.x,0);assert.equal(state.y,0);assert.equal(state.turn,0);
  const quiet=advanceTerrain(state,{reduced:true},1/24);
  assert.equal(quiet.time,state.time);
  assert.ok(quiet.strength<state.strength);
});

test('extreme input and a long hidden interval cannot create a terrain jump',()=>{
  const initial=createTerrainMotion(),resumed=advanceTerrain(initial,{pointerX:100,pointerY:-100,scroll:Infinity,typing:NaN},120);
  assert.ok(resumed.time<.11);
  assert.ok(resumed.pointerX<=1&&resumed.pointerY>=-1);
  for(const value of Object.values(resumed))assert.ok(Number.isFinite(value));
  const invalid=advanceTerrain(initial,{pointerX:NaN,pointerY:Infinity,scroll:NaN},NaN);
  for(const value of Object.values(invalid))assert.ok(Number.isFinite(value));
});
