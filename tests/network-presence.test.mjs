import test from 'node:test';
import assert from 'node:assert/strict';
import {attachNetworkPresence} from '../public/js/network-presence.js';
// Question: does a browser disconnect show a reversible, truthful presence state?
// Limits: browser connectivity events cannot establish provider reachability or saved persistence.
test('offline presence reacts once per transition and releases its listeners',()=>{
 const win=new EventTarget(),nav={onLine:true},reactions=[],badge={setAttribute(){},remove(){this.removed=true;}},doc={body:{dataset:{}},createElement:()=>badge};
 const release=attachNetworkPresence({stage:{canvas:{},time:2,character:{react:(...args)=>reactions.push(args)}},host:{append(){}},windowTarget:win,navigatorTarget:nav,documentTarget:doc});
 assert.equal(badge.hidden,true);nav.onLine=false;win.dispatchEvent(new Event('offline'));win.dispatchEvent(new Event('offline'));
 assert.equal(badge.hidden,false);assert.match(badge.textContent,/Offline/);assert.equal(reactions.length,1);
 nav.onLine=true;win.dispatchEvent(new Event('online'));assert.equal(badge.hidden,true);assert.equal(reactions.length,2);
 release();nav.onLine=false;win.dispatchEvent(new Event('offline'));assert.equal(reactions.length,2);assert.equal(badge.removed,true);
});
