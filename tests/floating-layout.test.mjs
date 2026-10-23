import test from 'node:test';
import assert from 'node:assert/strict';
import {floatingLayout,createKeyboardTracker,floatingAllowed} from '../public/js/floating-layout.js';

test('phone first placement uses the clear area above the welcome copy',()=>{
  const layout=floatingLayout({viewport:{width:390,height:844},header:{bottom:64},welcome:{top:238,height:300,right:372},composer:{top:692,right:372},nav:{height:60},compact:true});
  assert.ok(layout.initial.y+layout.size<=238);
});

test('a phone uses a small character and composer floor without reserving a chat row',()=>{
  const layout=floatingLayout({viewport:{width:390,height:844},shell:{left:18,right:372},header:{bottom:64},composer:{top:700},nav:{height:60},compact:true});
  assert.equal(layout.size,160);assert.equal(layout.bounds.left,26);assert.equal(layout.bounds.right,364);
  assert.ok(layout.bounds.floor>718&&layout.bounds.floor<721);
  assert.equal(layout.park.x,204);assert.ok(layout.park.y<layout.bounds.floor);
});

test('a reduced viewport only clamps offscreen placement, and has room for the composer',()=>{
  const layout=floatingLayout({viewport:{width:320,height:340,offsetTop:0},shell:{left:18,right:302},header:{bottom:58},composer:{top:270},nav:{height:0},compact:true});
  assert.ok(layout.bounds.bottom<=332);assert.ok(layout.park.y+layout.size<=layout.bounds.bottom);
});

test('short landscape and narrow Takeover layouts keep the character above navigation and inside the viewport',()=>{
  for(const viewport of [{width:667,height:375},{width:640,height:360},{width:320,height:240},{width:240,height:560}]){
    for(const takeover of [false,true]){
      const layout=floatingLayout({viewport,shell:{left:18,right:viewport.width-18},header:{bottom:100},composer:{top:viewport.height-155,right:viewport.width-22},nav:{height:60},compact:viewport.width<=600,takeover});
      assert.ok(layout.bounds.top>=108,'the available rectangle starts below the header');
      assert.ok(layout.bounds.bottom<=viewport.height-68,'controls and character must remain above bottom navigation');
      assert.ok(layout.bounds.right<=viewport.width-8,'Takeover must not widen the available rectangle');
      assert.ok(layout.size>=Math.min(96,viewport.height-176),'retain a useful size when the viewport has room');
      for(const point of [layout.initial,layout.park]){
        assert.ok(point.x>=layout.bounds.left&&point.x+layout.size<=layout.bounds.right);
        assert.ok(point.y>=layout.bounds.top&&point.y+layout.size<=layout.bounds.bottom);
      }
    }
  }
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
  assert.equal(layout.size,240);assert.ok(layout.park.x+layout.size<=layout.bounds.right);
  assert.ok(layout.park.y+layout.size<=layout.bounds.bottom);
});

test('Park rests on the actual composer even when a desktop has wide outer margins',()=>{
  const layout=floatingLayout({viewport:{width:1440,height:900},shell:{left:184,right:1440},header:{bottom:64},composer:{top:780,left:352,right:1272}});
  assert.equal(layout.bounds.right,1432);
  assert.equal(layout.park.x,1016);
  assert.equal(layout.park.x+layout.size,1272);
});

test('fresh desktop placement sits beside the welcome at its middle instead of on the composer',()=>{
  const layout=floatingLayout({viewport:{width:1440,height:900},shell:{left:184,right:1440},header:{bottom:64},welcome:{top:150,height:360,right:1272},composer:{top:780,right:1272}});
  assert.equal(layout.size,256);
  assert.deepEqual(layout.initial,{x:1016,y:202});
  assert.ok(layout.initial.y+layout.size<600,'the initial character is well above the composer');
  assert.ok(layout.park.y>500,'Park remains an explicit trip to the composer');
  assert.equal(layout.bounds.left,192,'the complete workspace remains draggable');
  assert.equal(layout.bounds.right,1432);
});

test('phone placement leaves a much smaller controls bot beside a readable character',()=>{
  const layout=floatingLayout({viewport:{width:390,height:844},shell:{left:18,right:372},header:{bottom:64},welcome:{top:110,height:300,right:372},composer:{top:700,right:372},nav:{height:60},compact:true});
  assert.equal(layout.size,160);
  assert.deepEqual(layout.initial,{x:204,y:72});
  assert.ok(layout.park.y>500);
  assert.ok(layout.park.y+layout.size<=layout.bounds.bottom);
});

test('a hidden welcome in a restored conversation keeps the default on the right at middle height',()=>{
  const layout=floatingLayout({viewport:{width:1440,height:900},shell:{left:184,right:1440},header:{bottom:64},welcome:{top:0,right:0,height:0},composer:{top:780,right:1272}});
  assert.deepEqual(layout.initial,{x:1176,y:236.5});
});
