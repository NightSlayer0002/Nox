import test from 'node:test';
import assert from 'node:assert/strict';
import {attachPresenceClearance,presenceClearance} from '../public/js/presence-clearance.js';
const column={left:22,right:540,width:518},character={left:330,right:474,top:74,bottom:218};
test('initial narrow placement wraps intersecting replies and leaves the rest full width',()=>{
  assert.equal(presenceClearance({enabled:true,character,column,message:{top:80,bottom:160}}),222);
  assert.equal(presenceClearance({enabled:true,character,column,message:{top:220,bottom:300}}),0);
  assert.equal(presenceClearance({enabled:true,character,column,message:{top:0,bottom:74}}),0);
});
test('manual overlay and gravity never impose reading margins or a reserved top row',()=>{
  assert.equal(presenceClearance({enabled:false,character,column,message:{top:80,bottom:160}}),0);
  assert.equal(presenceClearance({enabled:true,character:{...character,left:600},column,message:{top:80,bottom:160}}),0);
});

// Question: can an untouched character keep one stable reading measure for both
// roles, without deriving exclusion height from scrolled/previously wrapped text?
// Limits: substituted DOM boundary; the browser journey measures real glyphs,
// reply-follow scrolling, route transitions and source-panel layout.
test('automatic clearance gives offscreen and visible messages the same stable gutter',()=>{
  const messages=['nox','user'].map((role,index)=>({style:{setProperty(name,value){this[name]=value;},removeProperty(name){delete this[name];}},classList:{contains:name=>name===role},getBoundingClientRect:()=>({top:index?80:-300,bottom:index?160:-250}),querySelector:()=>null,toggleAttribute(){},removeAttribute(){}}));
  const conversation=Object.assign(new EventTarget(),{getBoundingClientRect:()=>({...column,top:74,bottom:700}),querySelectorAll:()=>messages});
  let scheduled,enabled=true;
  const windowTarget={requestAnimationFrame:callback=>(scheduled=callback,1),cancelAnimationFrame(){},MutationObserver:class{observe(){}disconnect(){}},ResizeObserver:class{observe(){}disconnect(){}}};
  const clearance=attachPresenceClearance({conversation,windowTarget,getPlacement:()=>({enabled,character})});
  clearance.update();scheduled();
  for(const message of messages){assert.equal(message.style.marginInlineEnd,'222px');assert.equal(message.style.maxInlineSize,'calc(100% - 222px)');assert.ok(!message.style['--presence-clearance-height'],'no scroll-dependent float may grow the transcript');}
  enabled=false;clearance.update();scheduled();
  for(const message of messages){assert.equal(message.style.marginInlineEnd,'');assert.equal(message.style.maxInlineSize,'');}
  clearance.dispose();
});
