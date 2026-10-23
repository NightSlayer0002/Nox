import test from 'node:test';
import assert from 'node:assert/strict';
import {createReplyPresentation} from '../public/js/reply-presentation.js';

function fixture(options={}){
  const timers=new Map(),reveals=[],waiting=[];let next=0;
  const gate=createReplyPresentation({voiceEnabled:true,isCurrent:()=>true,onReveal:reason=>reveals.push(reason),onWaiting:value=>waiting.push(value),setTimer:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearTimer:id=>timers.delete(id),...options});
  return {gate,timers,reveals,waiting};
}
test('spoken reply waits for actual playback and reveals exactly once',async()=>{
  const f=fixture();assert.deepEqual(f.reveals,[]);assert.deepEqual(f.waiting,[true]);
  assert.equal([...f.timers.values()][0].ms,4000);
  f.gate.reveal('playback');f.gate.reveal('playback');
  assert.equal(await f.gate.ready,true);assert.deepEqual(f.reveals,['playback']);assert.equal(f.timers.size,0);assert.deepEqual(f.waiting,[true,false]);
});
test('voice off reveals immediately without a timer',async()=>{
  const f=fixture({voiceEnabled:false});assert.equal(await f.gate.ready,true);assert.deepEqual(f.reveals,['text']);assert.equal(f.timers.size,0);
});
test('slow audio releases full text after a bounded wait',async()=>{
  const f=fixture();[...f.timers.values()][0].fn();
  assert.equal(await f.gate.ready,true);assert.deepEqual(f.reveals,['timeout']);f.gate.reveal('playback');assert.equal(f.reveals.length,1);
});
test('manual reveal and unavailable audio never wait for the timer',async()=>{
  for(const reason of ['requested','unavailable']){const f=fixture();f.gate.reveal(reason);assert.equal(await f.gate.ready,true);assert.deepEqual(f.reveals,[reason]);assert.equal(f.timers.size,0);}
});
test('canceled or superseded work cannot reveal stale text',async()=>{
  const f=fixture();const late=[...f.timers.values()][0].fn;f.gate.cancel();late();f.gate.reveal('playback');assert.equal(await f.gate.ready,false);assert.deepEqual(f.reveals,[]);
  const old=fixture({isCurrent:()=>false});old.gate.reveal('playback');assert.equal(await old.gate.ready,false);assert.deepEqual(old.reveals,[]);
});
