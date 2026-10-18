import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from '../public/js/stage.js';
import {Face} from '../public/js/face.js';

function fixture() {
  let box={left:10,top:20,width:370,height:360};
  const handlers=new Map(),draws=[],stage=Object.create(Stage.prototype);
  const canvas={width:740,height:720,style:{objectFit:'fill'},getBoundingClientRect:()=>box,
    addEventListener:(name,handler)=>handlers.set(name,handler),setPointerCapture(){}};
  Object.assign(stage,{canvas,ctx:{setTransform:(...values)=>draws.push(['transform',...values]),clearRect(){}},
    width:370,height:360,ratio:2,transparent:true,landing:false,time:1,caption:'',character:new Face(),
    forms:{},form:'face',pointer:{x:.5,y:.46},reduceMotion:false,events:new AbortController()});
  stage.character.draw=(_ctx,w,h)=>draws.push(['character',w,h]);
  return {stage,canvas,draws,handlers,setBox:value=>{box=value;}};
}

for(const [profile,width,height] of [['landscape',1280,720],['portrait',720,1280],['square',1080,1080]]) {
  test(`${profile} capture renders composition at export dimensions independently of the preview`,()=>{
    const {stage,canvas,draws,setBox}=fixture();
    stage.lockRecording(true,profile);
    assert.deepEqual([canvas.width,canvas.height,stage.width,stage.height,stage.ratio],[width,height,width,height,1]);
    assert.deepEqual(draws.at(-1),['character',width,height]);
    assert.equal(canvas.style.objectFit,'contain');
    setBox({left:0,top:0,width:320,height:600});stage.resize();
    assert.deepEqual([canvas.width,canvas.height],[width,height]);
    stage.lockRecording(false);
    assert.deepEqual([stage.width,stage.height],[320,600]);
    assert.equal(canvas.style.objectFit,'fill');
  });
}

test('a repeated recording lock cannot change the dimensions of an active stream',()=>{
  const {stage,canvas}=fixture();
  stage.lockRecording(true,'portrait');stage.lockRecording(true,'square');
  assert.deepEqual([canvas.width,canvas.height],[720,1280]);
  stage.lockRecording(false);
});

test('dragging maps the contained export image to character coordinates in a small preview',()=>{
  const {stage,handlers}=fixture();stage.bindPointer();stage.lockRecording(true,'landscape');
  handlers.get('pointerdown')({clientX:195,clientY:191.675,pointerId:1});
  assert.equal(stage.dragging,true);
  handlers.get('pointermove')({clientX:232,clientY:212.4875,pointerId:1});
  assert.ok(Math.abs(stage.character.x-.6)<1e-10);
  assert.ok(Math.abs(stage.character.y-.56)<1e-10);
  stage.lockRecording(false);
});

test('an invalid export profile leaves the preview available',()=>{
  const {stage,canvas}=fixture();
  assert.throws(()=>stage.lockRecording(true,'4k'),/profile/i);
  assert.notEqual(stage.recordingLocked,true);
  assert.deepEqual([canvas.width,canvas.height],[740,720]);
});

for(const profile of ['landscape','portrait','square']) {
  test(`${profile} export captions remain readable and inside the video frame`,()=>{
    const {stage}=fixture();const backgrounds=[];
    Object.assign(stage.ctx,{globalAlpha:1,save(){},restore(){},beginPath(){},
      roundRect:(x,y,width,height)=>backgrounds.push({x,y,width,height}),fill(){},fillText(){},
      measureText:text=>({width:text.length*20})});
    stage.caption='The story keeps going as NOX considers another possible path through this little world. '.repeat(4);
    stage.character.speakingUntil=Infinity;
    stage.lockRecording(true,profile);
    const fontSize=Number(stage.ctx.font.match(/([\d.]+)px/)[1]);
    assert.ok(fontSize>=24,'export captions need readable text at the encoded resolution');
    assert.ok(backgrounds.at(-1).y+backgrounds.at(-1).height<=stage.height,'all four caption lines must fit in the encoded image');
    stage.lockRecording(false);
  });
}
