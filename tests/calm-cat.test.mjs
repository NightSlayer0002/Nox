import test from 'node:test';
import assert from 'node:assert/strict';
import {catPerch,createCatSound,readCalmMode,saveCalmMode} from '../public/js/calm-cat.js';

// Question: can the cat's perch leave the visible screen or its support rail?
// Limits: geometry only; actual mobile keyboards and visual overlap need browser checks.
test('cat perch bounds travel and keeps its feet on the supplied interface edge',()=>{
  const support={left:20,right:370,top:650};
  const cat=catPerch({support,width:390,height:740,scale:2,travel:500});
  assert.ok(cat.x>=28&&cat.x+64<=362);assert.equal(cat.y+36,650);
  const small=catPerch({support:{left:0,right:200,top:10},width:200,height:100,scale:3,travel:-500});
  assert.ok(small.x>=8&&small.y>=8);assert.ok(small.y+66<=100);
});

// Question: does unavailable browser storage break this optional appearance control?
// Limits: does not test cross-tab rendering or persistence of conversation data.
test('calm preference degrades safely when browser storage is unavailable',()=>{
  const storage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  assert.equal(readCalmMode(storage),false);assert.equal(saveCalmMode(true,storage),true);
});

function soundWorld(){
  const nodes=[],changes=[],errors=[];let nextPending;
  class Audio {
    constructor(src){this.src=src;this.paused=true;this.pending=nextPending;nextPending=null;nodes.push(this);}
    play(){this.paused=false;return this.pending||Promise.resolve();}
    pause(){this.paused=true;}
    removeAttribute(){this.src='';}load(){}
  }
  return {nodes,changes,errors,deferNext(){let resolve;nextPending=new Promise(r=>{resolve=r;});return resolve;},controller:createCatSound({Audio,onChange:value=>changes.push(value),onError:()=>errors.push(true)})};
}

// Question: are sounds opt-in and silenced during voice/hidden-tab activity?
// Limits: substituted media; cannot establish audibility, volume or recording quality.
test('sound requires explicit enabling and quiet periods release all media',async()=>{
  const w=soundWorld();assert.equal(w.nodes.length,0);w.controller.pet();assert.equal(w.nodes.length,0);
  await w.controller.enable(true);assert.equal(w.nodes.length,1);assert.equal(w.nodes[0].loop,true);
  w.controller.quiet(true);assert.equal(w.nodes[0].paused,true);assert.equal(w.nodes[0].src,'');
  w.controller.quiet(false);assert.equal(w.nodes.length,2);
  await w.controller.pet();assert.ok(w.nodes.at(-1).src.endsWith('/meow.wav'));
  w.nodes.at(-1).onended();assert.ok(w.nodes.at(-1).src.endsWith('/purr.wav'));
  w.controller.dispose();assert.equal(w.nodes.at(-1).paused,true);
});

// Question: can late media startup make sound after mute or unmount?
// Limits: verifies ownership with controlled promises, not browser autoplay policy.
test('late playback cannot outlive mute, a newer sound, or disposal',async()=>{
  const w=soundWorld(),resolve=w.deferNext(),enabling=w.controller.enable(true),old=w.nodes.at(-1);
  w.controller.enable(false);await w.controller.enable(true);
  const active=w.nodes.at(-1);resolve();await enabling;
  assert.equal(old.paused,true);assert.equal(active.paused,false,'Old completion must not pause a newer purr');
  w.controller.quiet(true);assert.equal(active.paused,true);
  const release=w.deferNext();w.controller.quiet(false);const pending=w.nodes.at(-1);
  w.controller.dispose();release();await Promise.resolve();
  assert.equal(pending.paused,true);w.controller.quiet(false);assert.equal(w.nodes.length,3);
});

// Question: does rejected audio stay visibly muted and remain recoverable?
// Limits: no physical audio output or microphone is exercised.
test('playback rejection reports failure without enabling or looping failed audio',async()=>{
  class Blocked {play(){return Promise.reject(Error('denied'));}pause(){}removeAttribute(){}load(){}}
  const changes=[],errors=[],sound=createCatSound({Audio:Blocked,onChange:x=>changes.push(x),onError:()=>errors.push(true)});
  await sound.enable(true);assert.equal(changes.at(-1),false);assert.equal(errors.length,1);sound.dispose();
});
