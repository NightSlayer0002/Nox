import test from 'node:test';
import assert from 'node:assert/strict';
import {presenceClearance} from '../public/js/presence-clearance.js';
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
