import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmblemFollowers} from '../public/js/emblem-followers.js';

const pose={screenX:.75,screenY:.49,size:.34,opacity:1};
const frame={pose,width:1280,height:800,time:0,delta:1/60,pointer:null};
const centroid=agents=>({x:agents.reduce((n,a)=>n+a.x,0)/agents.length,y:agents.reduce((n,a)=>n+a.y,0)/agents.length});

test('a few robotic followers chase the cursor with momentum and leave a real movement history',()=>{
  const followers=createEmblemFollowers(),initial=followers.update(frame),start=centroid(initial.agents);
  assert.ok(initial.agents.length>=2&&initial.agents.length<=5);
  const pointer={x:.2,y:.35,at:0};
  const first=followers.update({...frame,pointer,time:1/60}),moved=centroid(first.agents);
  assert.ok(moved.x<start.x&&moved.x>256,'approach the cursor rather than teleport');
  for(let i=2;i<=120;i++)followers.update({...frame,pointer:{...pointer,at:i/60},time:i/60});
  const after=followers.update({...frame,pointer:{...pointer,at:2},time:2});
  assert.ok(Math.abs(centroid(after.agents).x-256)<150);
  for(const agent of after.agents){
    assert.ok(agent.trailCount>2);
    assert.ok(Math.hypot(agent.trail[0]-agent.trail[agent.trail.length-3],agent.trail[1]-agent.trail[agent.trail.length-2])>2);
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

test('reduced motion removes autonomous flight and long trails but still acknowledges pointer movement',()=>{
  const followers=createEmblemFollowers(),before=followers.update({...frame,reduceMotion:true}).agents.map(a=>({x:a.x,y:a.y}));
  const still=followers.update({...frame,time:30,reduceMotion:true});
  assert.deepEqual(still.agents.map(a=>({x:a.x,y:a.y})),before);
  const pointed=followers.update({...frame,time:31,pointer:{x:.2,y:.4,at:31},reduceMotion:true});
  assert.ok(centroid(pointed.agents).x<500,'direct interaction remains visible');
  assert.ok(pointed.agents.every(a=>a.trailCount===1));
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

test('cursor followers leave the headline and its controls clear instead of sitting over the copy',()=>{
  const followers=createEmblemFollowers(),avoid=[{left:0,right:1280,top:0,bottom:80},{left:110,right:740,top:110,bottom:470}];
  for(let i=0;i<240;i++){
    const result=followers.update({...frame,time:i/60,pointer:{x:.3,y:.3,at:i/60},avoid});
    for(const a of result.agents)for(const r of avoid)assert.ok(!(a.x>r.left-20&&a.x<r.right+20&&a.y>r.top-20&&a.y<r.bottom+20));
  }
});
