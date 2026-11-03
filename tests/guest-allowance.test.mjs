import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuestAllowance} from '../server/guest-allowance.mjs';

function redisFixture() {
  const values=new Map(),requests=[];
  const fetchImpl=async(url,options)=>{
    const command=JSON.parse(options.body);requests.push({url,options,command});
    if(command[0]==='MGET')return Response.json({result:command.slice(1).map(key=>values.get(key)??null)});
    assert.equal(command[0],'EVAL');
    const [,script,keyCount]=command;
    assert.match(script,/redis.call\('INCR'/);assert.match(script,/EXPIRE/);
    if(keyCount===1){
      const [key,limit,ttl]=command.slice(3),used=values.get(key)||0;
      assert.ok(ttl>0);
      if(used>=limit)return Response.json({result:[0]});
      values.set(key,used+1);return Response.json({result:[1]});
    }
    assert.ok(keyCount===2||keyCount===3);
    const [textKey,speechKey,globalKey]=command.slice(3,3+keyCount);
    const [kind,limit,ttl,globalLimit]=command.slice(3+keyCount);
    assert.ok(ttl>0);
    const key=kind==='text'?textKey:speechKey,used=values.get(key)||0,allowed=used<limit;
    if(allowed&&globalKey){
      const total=values.get(globalKey)||0;
      if(total>=globalLimit)return Response.json({result:[2,values.get(textKey)||0,values.get(speechKey)||0]});
      values.set(globalKey,total+1);
    }
    if(allowed)values.set(key,used+1);
    return Response.json({result:[allowed?1:0,values.get(textKey)||0,values.get(speechKey)||0]});
  };
  return {fetchImpl,requests,values};
}

test('guest and owner admissions share a ceiling across instances and UTC days',async()=>{
  // Question: do both admission paths address the same counters and preserve separate speech and text allowances?
  // Limits: models Redis results in memory, without testing Upstash or provider billing.
  const fixture=redisFixture();
  let time=Date.parse('2026-11-04T23:00:00Z');
  const options={...fixture,url:'https://fixture.upstash.io',token:'fixture',now:()=>time,textLimit:1,deploymentTextLimit:2,deploymentSpeechLimit:1};
  const first=createGuestAllowance(options),second=createGuestAllowance(options);
  assert.equal((await first.take('A','text')).allowed,true);
  assert.equal((await second.take('A','text')).code,'daily_limit');
  assert.equal((await second.takeDeployment('text')).allowed,true);
  const blocked=await first.take('B','text');
  assert.equal(blocked.code,'deployment_limit');
  assert.equal(blocked.usage.text.used,0);
  assert.equal(blocked.retryAfter,3600);
  assert.equal((await second.takeDeployment('text')).code,'deployment_limit');
  assert.equal((await first.take('B','speech')).allowed,true);
  assert.equal((await second.takeDeployment('speech')).code,'deployment_limit');
  time+=3600000;
  assert.equal((await first.take('B','text')).allowed,true);
});

test('enabled deployment ceilings fail closed when incomplete or unavailable',async()=>{
  // Question: can a failed shared admission allow a provider request?
  // Limits: verifies admission results with injected configuration and transport failure.
  for(const settings of [{deploymentTextLimit:2},{deploymentTextLimit:2,deploymentSpeechLimit:1}]){
    const allowance=createGuestAllowance({url:'https://fixture.upstash.io',token:'fixture',...settings,fetchImpl:async()=>{throw Error('Offline');}});
    assert.equal((await allowance.take('A','text')).code,'allowance_unavailable');
    assert.equal((await allowance.takeDeployment('speech')).code,'allowance_unavailable');
  }
});

test('preview mode never claims durable daily counts and independently bounds text and speech bursts',async()=>{
  let time=0;const allowance=createGuestAllowance({url:'',token:'',now:()=>time,textRate:2,speechRate:1});
  const initial=await allowance.status('network');
  assert.equal(initial.mode,'preview');assert.equal(initial.text.limit,null);assert.equal(initial.text.remaining,null);assert.equal(initial.rate.text.scope,'process');
  assert.equal((await allowance.take('network','text')).allowed,true);
  assert.equal((await allowance.take('network','text')).allowed,true);
  const limited=await allowance.take('network','text');assert.equal(limited.code,'rate_limit');assert.equal(limited.retryAfter,60);
  assert.equal((await allowance.take('network','speech')).allowed,true);
  assert.equal((await allowance.take('network','speech')).code,'rate_limit');
  time=60001;assert.equal((await allowance.take('network','text')).allowed,true);
});

test('durable atomic allowance survives separate process instances, separates budgets and resets by UTC day',async()=>{
  const fixture=redisFixture();let time=Date.parse('2026-10-19T22:00:00Z');
  const options={...fixture,url:'https://fixture.upstash.io',token:'server-secret',textLimit:2,speechLimit:1,now:()=>time};
  const first=createGuestAllowance(options),second=createGuestAllowance(options);
  const requests=await Promise.all([first.take('203.0.113.5','text'),second.take('203.0.113.5','text'),second.take('203.0.113.5','text')]);
  assert.equal(requests.filter(result=>result.allowed).length,2);
  const limited=requests.find(result=>!result.allowed);assert.equal(limited.code,'daily_limit');assert.equal(limited.usage.text.remaining,0);assert.equal(limited.retryAfter,7200);
  assert.equal((await second.take('203.0.113.5','speech')).allowed,true);
  assert.equal((await first.take('203.0.113.5','speech')).allowed,false);
  const current=await second.status('203.0.113.5');assert.equal(current.mode,'daily');assert.equal(current.text.used,2);assert.equal(current.speech.used,1);
  assert.ok(fixture.requests.every(({options})=>options.headers.authorization==='Bearer server-secret'));
  assert.ok([...fixture.values.keys()].every(key=>!key.includes('203.0.113.5')&&!key.includes('server-secret')));
  time+=3*3600000;const next=await first.take('203.0.113.5','text');assert.equal(next.allowed,true);assert.equal(next.usage.text.used,1);
});

test('configured allowance outages fail closed without inventing available daily messages',async()=>{
  for(const fetchImpl of [async()=>{throw Error('offline');},async()=>Response.json({error:'PRIVATE credentials'}),async()=>Response.json({result:['wrong']})]) {
    const allowance=createGuestAllowance({url:'https://fixture.upstash.io',token:'fixture',fetchImpl});
    const status=await allowance.status('network');assert.equal(status.mode,'unavailable');assert.equal(status.text.remaining,null);
    const result=await allowance.take('network','text');assert.equal(result.allowed,false);assert.equal(result.code,'allowance_unavailable');assert.equal(result.retryAfter,30);
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE|credentials|fixture/);
  }
});

test('partial durable config is unavailable rather than silently bypassing configured quotas',async()=>{
  const allowance=createGuestAllowance({url:'https://fixture.upstash.io',token:'',fetchImpl:async()=>{throw Error('Must not call network');}});
  assert.equal((await allowance.take('network','speech')).code,'allowance_unavailable');
});
test('daily rejected networks keep their abuse throttle but do not spend shared guest generation capacity',async()=>{
  const fixture=redisFixture();let time=Date.parse('2026-10-24T12:00:00Z');
  const allowance=createGuestAllowance({...fixture,url:'https://fixture.upstash.io',token:'fixture',textLimit:1,now:()=>time});
  for(const network of ['a','b','c'])assert.equal((await allowance.take(network,'text')).allowed,true);
  time+=60001;
  for(const network of ['a','b','c'])for(let i=0;i<8;i++)assert.equal((await allowance.take(network,'text')).code,'daily_limit');
  assert.equal((await allowance.take('a','text')).code,'rate_limit');
  assert.equal((await allowance.take('legitimate network','text')).allowed,true);
});
test('concurrent allowance-store failures release shared reservations while staying fail closed',async()=>{
  let offline=true;
  const fixture=redisFixture();
  const allowance=createGuestAllowance({url:'https://fixture.upstash.io',token:'fixture',now:()=>0,fetchImpl:async(...args)=>{await new Promise(resolve=>setImmediate(resolve));if(offline)throw Error('Offline');return fixture.fetchImpl(...args);}});
  const rejected=await Promise.all(Array.from({length:24},(_,i)=>allowance.take(`rejected-${i}`,'text')));
  assert.ok(rejected.every(result=>!result.allowed&&result.code==='allowance_unavailable'));
  offline=false;assert.equal((await allowance.take('legitimate','text')).allowed,true);
});

for(const [kind,accepted] of [['text',8],['speech',4]])test(`locally throttled ${kind} requests perform no Redis work`,async()=>{
  const fixture=redisFixture();
  const allowance=createGuestAllowance({...fixture,url:'https://fixture.upstash.io',token:'fixture',now:()=>Date.parse('2026-10-24T12:00:00Z')});
  for(let i=0;i<accepted;i++)assert.equal((await allowance.take('busy-network',kind)).allowed,true);
  const before=fixture.requests.length;
  const rejected=await Promise.all(Array.from({length:100},()=>allowance.take('busy-network',kind)));
  assert.ok(rejected.every(result=>!result.allowed&&result.code==='rate_limit'&&result.retryAfter===60));
  assert.equal(fixture.requests.length,before,'locally rejected traffic must not read or write the allowance store');
  assert.ok(rejected.every(result=>result.usage===null),'usage on this cheap rejection path is explicitly unavailable');
  assert.equal((await allowance.take('another-network',kind)).allowed,true);
});
