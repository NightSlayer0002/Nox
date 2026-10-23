import test from 'node:test';
import assert from 'node:assert/strict';
import {floatingLayout,createKeyboardTracker,floatingAllowed} from '../public/js/floating-layout.js';

test('a phone uses a small character and composer floor without reserving a chat row',()=>{
  const layout=floatingLayout({viewport:{width:390,height:844},shell:{left:18,right:372},header:{bottom:64},composer:{top:700},nav:{height:60},compact:true});
  assert.equal(layout.size,96);assert.equal(layout.bounds.left,26);assert.equal(layout.bounds.right,364);
  assert.ok(layout.bounds.floor>700&&layout.bounds.floor<708);
  assert.equal(layout.park.x,268);assert.ok(layout.park.y<layout.bounds.floor);
});

test('a reduced viewport only clamps offscreen placement, and has room for the composer',()=>{
  const layout=floatingLayout({viewport:{width:320,height:340,offsetTop:0},shell:{left:18,right:302},header:{bottom:58},composer:{top:270},nav:{height:0},compact:true});
  assert.ok(layout.bounds.bottom<=332);assert.ok(layout.park.y+layout.size<=layout.bounds.bottom);
});

test('keyboard tracking works when Android resizes innerHeight as well as visualViewport',()=>{
  const keyboard=createKeyboardTracker();
  assert.deepEqual(keyboard.update({width:390,height:844,layoutHeight:844,focused:true}),{open:false,changed:false});
  assert.deepEqual(keyboard.update({width:390,height:480,layoutHeight:480,focused:true}),{open:true,changed:true});
  assert.deepEqual(keyboard.update({width:390,height:450,layoutHeight:450,focused:true}),{open:true,changed:false});
  assert.deepEqual(keyboard.update({width:390,height:844,layoutHeight:844,focused:true}),{open:false,changed:true});
});

test('address bar changes and pinch zoom never masquerade as keyboard transitions',()=>{
  const keyboard=createKeyboardTracker();
  keyboard.update({width:390,height:800,layoutHeight:844,focused:false});
  assert.equal(keyboard.update({width:390,height:740,layoutHeight:844,focused:true}).open,false);
  assert.equal(keyboard.update({width:390,height:400,layoutHeight:844,focused:true,scale:2}).changed,false);
});

test('call, film, recording and other routes retain their existing stage',()=>{
  const state={view:'conversation',presence:'visible',callOpen:'false'};
  assert.equal(floatingAllowed(state),true);
  for(const extra of [{view:'afterimage'},{view:'scenes'},{presence:'hidden'},{callOpen:'true'},{film:true},{recording:true}])assert.equal(floatingAllowed({...state,...extra}),false);
});

test('Takeover enlarges the floating character while keeping its parked bounds visible',()=>{
  const layout=floatingLayout({viewport:{width:390,height:844},composer:{top:700},compact:true,takeover:true});
  assert.equal(layout.size,144);assert.ok(layout.park.x+layout.size<=layout.bounds.right);
  assert.ok(layout.park.y+layout.size<=layout.bounds.bottom);
});

test('Park rests on the actual composer even when a desktop has wide outer margins',()=>{
  const layout=floatingLayout({viewport:{width:1440,height:900},shell:{left:184,right:1440},header:{bottom:64},composer:{top:780,left:352,right:1272}});
  assert.equal(layout.bounds.right,1432);
  assert.equal(layout.park.x,1144);
  assert.equal(layout.park.x+layout.size,1272);
});
