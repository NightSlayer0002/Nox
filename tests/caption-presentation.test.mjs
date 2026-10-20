import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from '../public/js/stage.js';
import {Face} from '../public/js/face.js';

function fixture(mode='speaking') {
  const draws=[],saved=[],ctx={
    globalAlpha:1,setTransform(){},clearRect(){},beginPath(){},roundRect(){},
    save(){saved.push(this.globalAlpha);},restore(){this.globalAlpha=saved.pop();},
    measureText(text){return {width:text.length*6};},
    fill(){draws.push({kind:'background',alpha:this.globalAlpha});},
    fillText(text,x,y){draws.push({kind:'text',text,x,y,alpha:this.globalAlpha});},
  };
  const stage=Object.create(Stage.prototype);
  Object.assign(stage,{ctx,width:580,height:340,ratio:1,transparent:true,landing:false,characterAlpha:0,character:new Face(),time:0,captionUntil:0});
  if(mode)stage.captionMode=mode;
  function render(time) {draws.length=0;stage.time=time;stage.render();return [...draws];}
  return {stage,ctx,render};
}
const packet={speech:'This thought has a voice.',emotion:'curious',action:'none'};
const textDraws=draws=>draws.filter(draw=>draw.kind==='text');

test('Conversation captions wait for actual narration and remain visible throughout it',()=>{
  const {stage,render}=fixture();stage.speak(packet);
  assert.deepEqual(render(1),[]);
  stage.narrating=true;
  assert.equal(textDraws(render(2))[0].text,packet.speech);
  assert.equal(textDraws(render(30))[0].alpha,1);
});

test('ending narration fades caption text and its background together over 450ms',()=>{
  const {stage,ctx,render}=fixture();stage.speak(packet);stage.narrating=true;render(2);
  stage.narrating=false;
  assert.ok(render(2).every(draw=>draw.alpha===1));
  const fading=render(2.225);
  assert.equal(fading.length,2);
  assert.ok(fading.every(draw=>Math.abs(draw.alpha-.5)<1e-10));
  assert.equal(ctx.globalAlpha,1);
  assert.deepEqual(render(2.46),[]);
});

test('narration that ends before the first frame still completes its fade',()=>{
  const {stage,render}=fixture();stage.time=3;stage.speak(packet);
  stage.narrating=true;stage.narrating=false;
  assert.ok(textDraws(render(3.225))[0].alpha<1);
  assert.deepEqual(render(3.46),[]);
});

test('restored Conversation text stays hidden without narration despite estimated speaking time',()=>{
  const {stage,render}=fixture();
  stage.caption='A reply restored from history.';stage.captionUntil=8;stage.character.speakingUntil=Infinity;
  assert.deepEqual(render(1),[]);
});

test('switching views preserves the fade and does not reveal a silent Conversation caption',()=>{
  const {stage,render}=fixture('linger');stage.speak(packet);
  assert.equal(textDraws(render(1)).length,1);
  stage.captionMode='speaking';assert.deepEqual(render(1),[]);
  stage.narrating=true;render(2);stage.narrating=false;
  stage.captionMode='linger';assert.equal(textDraws(render(2.225))[0].alpha,1);
  stage.captionMode='speaking';assert.ok(Math.abs(textDraws(render(2.225))[0].alpha-.5)<1e-10);
  assert.deepEqual(render(2.46),[]);
});

test('the default Scene studio and Afterimage caption mode keeps its existing expiry',()=>{
  const {stage,render}=fixture(null);stage.speak(packet);
  assert.equal(textDraws(render(1)).length,1);
  assert.deepEqual(render(8),[]);
  stage.character.speakingUntil=Infinity;
  assert.equal(textDraws(render(30)).length,1);
  stage.character.speakingUntil=30;
  assert.deepEqual(render(30),[]);
});

test('recording keeps normal caption linger even when Conversation would hide it',()=>{
  const {stage,render}=fixture();stage.speak(packet);stage.recordingLocked=true;
  assert.equal(textDraws(render(1))[0].alpha,1);
  stage.recordingLocked=false;assert.deepEqual(render(1),[]);
  stage.recordingLocked=true;stage.character.speakingUntil=Infinity;
  assert.equal(textDraws(render(30))[0].alpha,1);
  stage.character.speakingUntil=30;assert.deepEqual(render(30),[]);
});

test('replacing a fading caption cannot transfer an old fade to a fresh reply',()=>{
  const {stage,render}=fixture();stage.speak(packet);stage.narrating=true;render(1);stage.narrating=false;
  stage.caption='A fresh silent reply.';stage.captionUntil=9;
  assert.deepEqual(render(1.1),[]);
  stage.narrating=true;
  assert.equal(textDraws(render(1.2))[0].text,'A fresh silent reply.');
  assert.equal(textDraws(render(1.2))[0].alpha,1);
});

test('replaying identical text starts a fresh caption instead of inheriting an old fade',()=>{
  const {stage,render}=fixture();stage.speak(packet);stage.narrating=true;render(1);stage.narrating=false;
  stage.speak(packet);assert.deepEqual(render(1.1),[]);
  stage.narrating=true;assert.equal(textDraws(render(1.2))[0].alpha,1);
  stage.narrating=false;assert.deepEqual(render(1.7),[]);
});

test('replacing an active reply before voice cancellation cannot flash the new text',()=>{
  const {stage,render}=fixture();stage.speak(packet);stage.narrating=true;render(1);
  stage.speak({...packet,speech:'The next reply waits for its own voice.'});
  stage.narrating=false;
  assert.deepEqual(render(1.1),[]);
  stage.narrating=true;assert.equal(textDraws(render(1.2))[0].alpha,1);
});

test('clearing a canceled caption prevents its fade from reappearing',()=>{
  const {stage,render}=fixture();stage.speak(packet);stage.narrating=true;render(1);
  stage.narrating=false;stage.caption='';
  assert.deepEqual(render(1.1),[]);
  stage.caption='Another saved reply.';stage.captionUntil=9;
  assert.deepEqual(render(1.2),[]);
});

test('Conversation captions keep all four lines above the floating replay controls',()=>{
  const {stage,render}=fixture();
  stage.speak({...packet,speech:'A short line of text for a careful spoken thought. '.repeat(7)});
  stage.narrating=true;
  const lines=textDraws(render(1));
  assert.equal(lines.length,4);
  assert.ok(lines.at(-1).y<=275,'the last line must leave 65px below its baseline');
});

test('Scene studio and recorded captions retain their original vertical position',()=>{
  for(const recording of [false,true]){
    const {stage,render}=fixture(recording?'speaking':'linger');
    stage.recordingLocked=recording;
    stage.speak({...packet,speech:'A short line of text for a careful spoken thought. '.repeat(7)});
    const lines=textDraws(render(1));
    assert.equal(lines.length,4);
    assert.ok(Math.abs(lines[0].y-275.4)<1e-10);
  }
});

test('hidden stage captions stay off screen while the same spoken text remains in recordings',()=>{
  const {stage,render}=fixture('hidden');stage.speak(packet);stage.narrating=true;
  stage.character.speakingUntil=Infinity;
  assert.deepEqual(render(1),[]);
  stage.recordingLocked=true;
  assert.equal(textDraws(render(1))[0].text,packet.speech);
  assert.equal(textDraws(render(30))[0].alpha,1);
  stage.recordingLocked=false;
  assert.deepEqual(render(30),[]);
  assert.equal(stage.character.speakingUntil,Infinity);
});

test('a conversation caption target keeps text outside the masked artwork canvas',()=>{
  const {stage,render}=fixture(),target={hidden:true,textContent:'',style:{}};
  stage.captionTarget=target;stage.speak(packet);stage.narrating=true;
  assert.deepEqual(textDraws(render(1)),[],'do not duplicate subtitles under the artwork mask');
  assert.equal(target.hidden,false);assert.equal(target.textContent,packet.speech);
  assert.equal(target.style.opacity,'1');
  stage.scene={action:'gravity',start:0,velocity:1};stage.character.y=.8;
  render(2);assert.equal(target.style.opacity,'1');assert.equal(target.textContent,packet.speech);
  stage.narrating=false;render(2.5);assert.equal(target.hidden,true);
});

test('recording and film presentations retain embedded captions without restarting narration',()=>{
  const {stage,render}=fixture(),target={hidden:true,textContent:'',style:{}};
  stage.captionTarget=target;stage.speak(packet);stage.narrating=true;stage.character.speakingUntil=Infinity;
  render(1);assert.equal(target.hidden,false);
  stage.recordingLocked=true;
  assert.equal(textDraws(render(2))[0].text,packet.speech);assert.equal(target.hidden,true);
  stage.recordingLocked=false;stage.captionTargetEnabled=false;
  assert.equal(textDraws(render(3))[0].text,packet.speech);assert.equal(target.hidden,true);
  stage.captionTargetEnabled=true;
  assert.deepEqual(textDraws(render(4)),[]);assert.equal(target.hidden,false);
  assert.equal(stage.narrating,true);assert.equal(stage.character.speakingUntil,Infinity);
});
