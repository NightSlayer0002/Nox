import test from 'node:test';
import assert from 'node:assert/strict';
import {attachReplyFollow} from '../public/js/reply-follow.js';

function fixture(ResizeObserverCtor){
  const events=new Map(),buttonEvents=new Map();
  const conversation={scrollTop:600,clientHeight:400,scrollHeight:1000,addEventListener:(name,fn)=>events.set(name,fn)};
  const button={hidden:true,addEventListener:(name,fn)=>buttonEvents.set(name,fn)};
  conversation.children=[];
  const follow=attachReplyFollow({conversation,button,ResizeObserverCtor});
  return {conversation,button,follow,scroll:()=>events.get('scroll')(),click:()=>buttonEvents.get('click')()};
}
test('reply growth follows readers already near the end',()=>{
  const f=fixture();f.follow.update(()=>{f.conversation.scrollHeight+=200;});
  assert.equal(f.conversation.scrollTop,1200);assert.equal(f.button.hidden,true);
});
test('late character-clearance reflow follows only an attached reader',()=>{
  let reflow;const f=fixture(class{constructor(callback){reflow=callback;}observe(){}unobserve(){}});
  f.click();f.conversation.scrollHeight+=300;reflow();assert.equal(f.conversation.scrollTop,1300);
  f.conversation.scrollTop=100;f.scroll();f.conversation.scrollHeight+=300;reflow();
  assert.equal(f.conversation.scrollTop,100);assert.equal(f.button.hidden,false);
});
test('streaming and final reveal leave a reader above the end in place',()=>{
  const f=fixture();f.conversation.scrollTop=100;f.scroll();
  for(let i=0;i<5;i++)f.follow.update(()=>{f.conversation.scrollHeight+=200;});
  assert.equal(f.conversation.scrollTop,100);assert.equal(f.button.hidden,false);
  f.click();assert.equal(f.conversation.scrollTop,2000);assert.equal(f.button.hidden,true);
});
test('manual return near the end resumes following and opening another thread resets it',()=>{
  const f=fixture();f.conversation.scrollTop=100;f.scroll();assert.equal(f.button.hidden,false);
  f.conversation.scrollTop=580;f.scroll();assert.equal(f.button.hidden,true);
  f.follow.update(()=>{f.conversation.scrollHeight=1200;});assert.equal(f.conversation.scrollTop,1200);
  f.follow.latest();assert.equal(f.button.hidden,true);
});
