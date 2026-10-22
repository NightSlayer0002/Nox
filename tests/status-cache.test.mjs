import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createAppServer} from '../server.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const cacheFor=async options=>(await import('../server/status-cache.mjs')).createStatusCache(options);
const usage=used=>({mode:'daily',scope:'shared-network',text:{limit:20,used,remaining:Math.max(0,20-used)},speech:{limit:30,used:0,remaining:30}});
const packet={speech:'A complete answer.',emotion:'curious',action:'none',memory:''};
const request=(base,path='/api/status',body,headers={})=>new Promise((resolve,reject)=>{
  const req=http.request(base+path,{method:body?'POST':'GET',headers:{host:'nox.example',origin:'https://nox.example','content-type':'application/json',...headers}},res=>{
    const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{const data=Buffer.concat(chunks);resolve({status:res.statusCode,headers:res.headers,body:res.headers['content-type']?.startsWith('application/json')?JSON.parse(data.toString()):data});});
  });req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
});
async function withServer(options,run){
  const server=createAppServer({hosted:true,publicHosts:['nox.example'],accessToken:'owner',providers:[{id:'groq',name:'Groq',model:'private-model'}],defaultProvider:'groq',apiKey:'',speechKey:'',naturalVoice:false,providerRequest:async()=>packet,...options});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await run(`http://127.0.0.1:${server.address().port}`);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
async function waitUntil(check){for(let index=0;index<100&&!check();index++)await new Promise(resolve=>setImmediate(resolve));assert.ok(check(),'request reached the status reader');}

test('anonymous HTTP status polls reuse a short snapshot and refresh after it expires',async()=>{
  let time=100000,reads=0;
  const allowance={status:async()=>{reads++;return usage(reads);},take:async()=>({allowed:true,usage:usage(1)})};
  await withServer({now:()=>time,guestAllowance:allowance},async base=>{
    for(let index=0;index<5;index++){const response=await request(base);assert.equal(response.status,200);assert.equal(response.body.usage.text.used,1);assert.equal(response.headers['cache-control'],'no-store');}
    assert.equal(reads,1);time+=5000;
    assert.equal((await request(base)).body.usage.text.used,2);assert.equal(reads,2);
  });
});

test('concurrent anonymous HTTP status requests share the same backend read',async()=>{
  const gate=deferred();let reads=0;
  await withServer({guestAllowance:{status:()=>{reads++;return gate.promise;},take:async()=>({allowed:true,usage:usage(1)})}},async base=>{
    const requests=Array.from({length:8},()=>request(base));await waitUntil(()=>reads>0);gate.resolve(usage(4));
    const responses=await Promise.all(requests);assert.ok(responses.every(response=>response.status===200&&response.body.usage.text.used===4));assert.equal(reads,1);
  });
});

test('status HTTP throttling returns Retry-After without another allowance read and leaves owner metadata private',async()=>{
  let time=100000,reads=0;
  await withServer({now:()=>time,guestAllowance:{status:async()=>{reads++;return usage(2);},take:async()=>({allowed:true,usage:usage(1)})}},async base=>{
    for(let index=0;index<30;index++)assert.equal((await request(base)).status,200);
    const limited=await request(base);assert.equal(limited.status,429);assert.equal(limited.headers['retry-after'],'60');assert.equal(limited.body.code,'rate_limit');assert.equal(reads,1);
    const owner=await request(base,'/api/status',undefined,{authorization:'Bearer owner'});
    assert.equal(owner.status,200);assert.equal(owner.body.owner,true);assert.equal(owner.body.usage,null);assert.equal(owner.body.model,'private-model');assert.equal(reads,1);
    time+=60000;const guest=await request(base);assert.equal(guest.status,200);assert.equal(guest.body.owner,false);assert.equal(guest.body.model,null);assert.deepEqual(guest.body.providers,[]);assert.equal(reads,2);
  });
});

for(const allowed of [true,false])test(`fresh ${allowed?'accepted':'rejected'} generation usage replaces status without enforcing a cached allowance`,async()=>{
  let reads=0,takes=0,providerCalls=0;
  const initial=usage(allowed?20:0),fresh=usage(allowed?1:20);
  const allowance={status:async()=>{reads++;return initial;},take:async()=>{takes++;return {allowed,usage:fresh,...(allowed?{}:{code:'daily_limit',retryAfter:60})};}};
  await withServer({guestAllowance:allowance,providerRequest:async()=>{providerCalls++;return packet;}},async base=>{
    await request(base);const generated=await request(base,'/api/chat',{message:'A useful question.'},{'x-nox-guest':'1'});
    assert.equal(generated.status,allowed?200:429);assert.equal(takes,1);assert.equal(providerCalls,allowed?1:0);
    const status=await request(base);assert.deepEqual(status.body.usage,fresh);assert.equal(reads,1);
  });
});

test('a pending old status read cannot overwrite a newer atomic generation decision',async()=>{
  const gate=deferred();let reads=0;
  const allowance={status:()=>{reads++;return gate.promise;},take:async()=>({allowed:true,usage:usage(1)})};
  await withServer({guestAllowance:allowance},async base=>{
    const oldStatus=request(base);await waitUntil(()=>reads>0);
    assert.equal((await request(base,'/api/chat',{message:'A new question.'},{'x-nox-guest':'1'})).status,200);
    gate.resolve(usage(0));assert.equal((await oldStatus).body.usage.text.used,1);
    assert.equal((await request(base)).body.usage.text.used,1);assert.equal(reads,1);
  });
});

test('shared generation rejections reuse the most recent usage without a status backend read',async()=>{
  let reads=0,takes=0;
  const allowance={status:async()=>{reads++;return usage(0);},take:async()=>{takes++;return {allowed:true,usage:usage(takes)};}};
  await withServer({guestAllowance:allowance},async base=>{
    for(let index=0;index<30;index++)assert.equal((await request(base,'/api/chat',{message:`Question ${index}`},{'x-nox-guest':'1'})).status,200);
    for(let index=0;index<3;index++){
      const blocked=await request(base,'/api/chat',{message:'Keep this draft.'},{'x-nox-guest':'1'});assert.equal(blocked.status,429);assert.equal(blocked.body.usage.text.used,30);
    }
    assert.equal(takes,30);assert.equal(reads,0);
  });
});

test('shared generation rejection with no anonymous snapshot returns minimal usage instead of fetching it',async()=>{
  let reads=0;
  await withServer({guestAllowance:{status:async()=>{reads++;return usage(0);},take:async()=>({allowed:true,usage:usage(1)})}},async base=>{
    for(let index=0;index<30;index++)assert.equal((await request(base,'/api/chat',{message:`Owner question ${index}`},{authorization:'Bearer owner'})).status,200);
    const blocked=await request(base,'/api/chat',{message:'Guest question.'},{'x-nox-guest':'1'});assert.equal(blocked.status,429);assert.equal(blocked.body.usage,null);assert.equal(reads,0);
  });
});

test('status snapshots isolate networks and expire using the supplied clock',async()=>{
  let time=0,reads=0;const cache=await cacheFor({now:()=>time,ttlMs:100,maxEntries:2});
  assert.deepEqual(await cache.get('network-a',async()=>{reads++;return usage(1);}),usage(1));
  assert.deepEqual(await cache.get('network-b',async()=>{reads++;return usage(2);}),usage(2));
  time=99;assert.deepEqual(cache.peek('network-a'),usage(1));await cache.get('network-a',async()=>{throw Error('must reuse snapshot');});
  time=100;assert.equal(cache.peek('network-a'),undefined);assert.deepEqual(await cache.get('network-a',async()=>{reads++;return usage(3);}),usage(3));assert.equal(reads,3);
});

test('bounded snapshots evict old networks without keeping an unbounded identity map',async()=>{
  let reads=0;const cache=await cacheFor({maxEntries:2});
  cache.set('network-a',usage(1));cache.set('network-b',usage(2));cache.set('network-c',usage(3));
  assert.equal(cache.peek('network-a'),undefined);assert.deepEqual(cache.peek('network-b'),usage(2));assert.deepEqual(cache.peek('network-c'),usage(3));
  await cache.get('network-a',async()=>{reads++;return usage(4);});assert.equal(reads,1);assert.equal(cache.peek('network-b'),undefined);
});

test('coalesced in-flight reads are bounded even before any snapshot exists',async()=>{
  const a=deferred(),b=deferred();let reads=0;const cache=await cacheFor({maxEntries:2});
  const first=cache.get('network-a',()=>{reads++;return a.promise;}),duplicate=cache.get('network-a',()=>{throw Error('duplicate read');});
  const second=cache.get('network-b',()=>{reads++;return b.promise;});
  assert.equal(await cache.get('network-c',()=>{reads++;return usage(3);}),null);assert.equal(reads,2);
  a.resolve(usage(1));b.resolve(usage(2));assert.deepEqual(await first,usage(1));assert.deepEqual(await duplicate,usage(1));assert.deepEqual(await second,usage(2));
  assert.deepEqual(await cache.get('network-c',()=>{reads++;return usage(3);}),usage(3));assert.equal(reads,3);
});

test('fresh decisions supersede pending reads while explicit invalidation prevents stale cache revival',async()=>{
  const cache=await cacheFor(),old=deferred(),invalid=deferred();
  const first=cache.get('network-a',()=>old.promise);cache.set('network-a',usage(4));old.resolve(usage(0));
  assert.deepEqual(await first,usage(4));assert.deepEqual(cache.peek('network-a'),usage(4));
  const second=cache.get('network-b',()=>invalid.promise);cache.invalidate('network-b');invalid.resolve(usage(0));
  assert.equal(await second,null);assert.equal(cache.peek('network-b'),undefined);
  assert.deepEqual(await cache.get('network-b',async()=>usage(5)),usage(5));
});

test('a failed status read releases its coalescing slot and can be retried',async()=>{
  const cache=await cacheFor({maxEntries:1});
  await assert.rejects(cache.get('network-a',async()=>{throw Error('backend offline');}),/backend offline/);
  assert.deepEqual(await cache.get('network-b',async()=>usage(2)),usage(2));
});

test('invalid cache bounds cannot disable expiration or memory limits',async()=>{
  for(const options of [{ttlMs:0},{ttlMs:Infinity},{maxEntries:0},{maxEntries:Infinity}])await assert.rejects(cacheFor(options),RangeError);
});

test('natural speech decisions refresh the same anonymous status snapshot',async()=>{
  let reads=0;const fresh={...usage(0),speech:{limit:30,used:1,remaining:29}};
  await withServer({naturalVoice:true,speechKey:'fixture',speechProvider:'groq',speech:async()=>Buffer.from('RIFF'),guestAllowance:{status:async()=>{reads++;return usage(0);},take:async(_network,kind)=>{assert.equal(kind,'speech');return {allowed:true,usage:fresh};}}},async base=>{
    await request(base);assert.equal((await request(base,'/api/speech',{text:'A useful thought.'},{'x-nox-guest':'1'})).status,200);
    assert.deepEqual((await request(base)).body.usage,fresh);assert.equal(reads,1);
  });
});

test('intentional preview allowance remains a preview when anonymous status is cached',async()=>{
  const {createGuestAllowance}=await import('../server/guest-allowance.mjs');
  await withServer({guestAllowance:createGuestAllowance({url:'',token:''})},async base=>{
    for(let index=0;index<2;index++){
      const response=await request(base);assert.equal(response.status,200);assert.equal(response.body.usage.mode,'preview');assert.equal(response.body.usage.text.limit,null);assert.equal(response.body.usage.speech.remaining,null);
    }
  });
});
