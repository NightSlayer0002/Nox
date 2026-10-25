import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuestAllowance} from '../server/guest-allowance.mjs';

function redisFixture() {
  const values=new Map(),requests=[];
  const fetchImpl=async(url,options)=>{
    const command=JSON.parse(options.body);requests.push({url,options,command});
    if(command[0]==='MGET')return Response.json({result:command.slice(1).map(key=>values.get(key)??null)});
    assert.equal(command[0],'EVAL');
    const [,script,keyCount,textKey,speechKey,kind,limit,ttl]=command;
    assert.match(script,/redis.call\('INCR'/);assert.match(script,/EXPIRE/);assert.equal(keyCount,2);assert.ok(ttl>0);
    const key=kind==='text'?textKey:speechKey,used=values.get(key)||0,allowed=used<limit;
    if(allowed)values.set(key,used+1);
    return Response.json({result:[allowed?1:0,values.get(textKey)||0,values.get(speechKey)||0]});
  };
  return {fetchImpl,requests,values};
}

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
