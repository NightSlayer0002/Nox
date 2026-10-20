import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmblemFollowers} from '../public/js/emblem-followers.js';

const pose={screenX:.75,screenY:.49,size:.34,opacity:1};
const frame={pose,width:1280,height:800,time:0,delta:1/60,pointer:null};
const centroid=agents=>({x:agents.reduce((n,a)=>n+a.x,0)/agents.length,y:agents.reduce((n,a)=>n+a.y,0)/agents.length});

test('the three followers stay with the emblem regardless of cursor activity',()=>{
  const calm=createEmblemFollowers(),pointed=createEmblemFollowers();
  for(let i=0;i<=240;i++){
    const input={...frame,time:i/60,pose:{...pose,screenX:.75-i/240*.5}};
    const expected=calm.update(input),actual=pointed.update({...input,pointer:{x:i%2,y:.1,at:i/60}});
    assert.equal(actual.agents.length,3);
    assert.deepEqual(actual.agents.map(a=>[a.x,a.y]),expected.agents.map(a=>[a.x,a.y]));
  }
});

test('the robotic followers remain evenly divided around the eyes-and-smile face',()=>{
  const followers=createEmblemFollowers();
  for(let i=0;i<=1200;i++){
    const {agents}=followers.update({...frame,time:i/60});
    if(i%120)continue;
    const center=centroid(agents),angles=agents.map(a=>Math.atan2((a.y-center.y)/.83,a.x-center.x)).sort((a,b)=>a-b);
    assert.ok(Math.hypot(center.x-pose.screenX*frame.width,center.y-pose.screenY*frame.height)<1);
    for(let n=0;n<3;n++)assert.ok(Math.abs((angles[(n+1)%3]-angles[n]+Math.PI*2)%(Math.PI*2)-Math.PI*2/3)<.02,'preserve equal spacing as they fly');
  }
});

test('each follower flies its own route at rest and follows the face to the other side on scroll',()=>{
  const followers=createEmblemFollowers(),before=followers.update(frame).agents.map(a=>({x:a.x,y:a.y}));
  for(let i=1;i<=180;i++)followers.update({...frame,time:i/60});
  const wandering=followers.update({...frame,time:3});
  const travel=wandering.agents.map((a,i)=>({x:a.x-before[i].x,y:a.y-before[i].y}));
  assert.ok(travel.every(v=>Math.hypot(v.x,v.y)>10));
  assert.notDeepEqual(travel[0],travel[1]);
  for(let i=181;i<=420;i++)followers.update({...frame,pose:{...pose,screenX:.23},time:i/60});
  assert.ok(centroid(followers.update({...frame,pose:{...pose,screenX:.23},time:7}).agents).x<500);
});

for(const fps of [30,60,144])test(`flight ribbons retain about one second of actual history at ${fps} Hz`,()=>{
  const followers=createEmblemFollowers();let oneSecondAgo,result;
  for(let tick=0;tick<=3*fps;tick++){
    result=followers.update({...frame,time:tick/fps,delta:1/fps});
    if(tick===2*fps)oneSecondAgo=result.agents.map(a=>({x:a.x,y:a.y}));
  }
  for(const [i,agent] of result.agents.entries()){
    const tail=(agent.trailCount-1)*3;
    assert.ok(agent.trailCount>2,'retain a visible flight history');
    assert.ok(Math.hypot(agent.trail[0]-agent.x,agent.trail[1]-agent.y)<.01,'keep the ribbon attached to its head');
    assert.ok(Math.hypot(agent.trail[tail]-oneSecondAgo[i].x,agent.trail[tail+1]-oneSecondAgo[i].y)<12,'the tail follows the route from about one second ago');
  }
});

test('reduced motion freezes the formation while still following the emblem',()=>{
  const followers=createEmblemFollowers(),before=followers.update({...frame,reduceMotion:true}).agents.map(a=>({x:a.x,y:a.y}));
  const still=followers.update({...frame,time:30,reduceMotion:true});
  assert.deepEqual(still.agents.map(a=>({x:a.x,y:a.y})),before);
  const moved=followers.update({...frame,pose:{...pose,screenX:.23},time:31,reduceMotion:true});
  assert.ok(centroid(moved.agents).x<500,'scrolling still places them around the face');
  assert.ok(moved.agents.every(a=>a.trailCount===1));
});

test('resizing or resuming a hidden tab resets trails instead of drawing a line across the page',()=>{
  for(const next of [{...frame,width:390,height:844},{...frame,time:400,delta:399},{...frame,time:400,delta:0}]){
    const followers=createEmblemFollowers();followers.update(frame);
    for(let i=1;i<50;i++)followers.update({...frame,time:i/60});
    const result=followers.update(next);
    assert.ok(result.agents.length>0);
    for(const agent of result.agents){assert.equal(agent.trailCount,1);assert.ok([...agent.trail,agent.x,agent.y].every(Number.isFinite));}
  }
});

test('text regions do not deflect the followers or cut their trails',()=>{
  const free=createEmblemFollowers(),overText=createEmblemFollowers(),avoid=[{left:700,right:1250,top:100,bottom:700}];
  for(let i=0;i<240;i++){
    const expected=free.update({...frame,time:i/60}),actual=overText.update({...frame,time:i/60,avoid});
    assert.deepEqual(actual.agents.map(a=>[a.x,a.y,a.trailCount,...a.trail]),expected.agents.map(a=>[a.x,a.y,a.trailCount,...a.trail]));
  }
});
