import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createAppServer} from '../server.mjs';
import {createGuestAllowance} from '../server/guest-allowance.mjs';

const packet={speech:'A complete fixture answer.',emotion:'curious',action:'none',memory:''};
const now=()=>Date.parse('2026-10-28T12:00:00Z');
function fixture({preview=false,offline=false,textLimit=20,textRate=2}={}){
  const values=new Map();let providerCalls=0;
  const fetchImpl=async(_url,options)=>{
    if(offline)throw Error('Synthetic Redis unavailable.');
    const command=JSON.parse(options.body);
    if(command[0]==='MGET')return Response.json({result:command.slice(1).map(key=>values.get(key)??null)});
    const [, , ,textKey,speechKey,kind,limit]=command,key=kind==='text'?textKey:speechKey,used=values.get(key)||0,allowed=used<Number(limit);
    if(allowed)values.set(key,used+1);
    return Response.json({result:[allowed?1:0,values.get(textKey)||0,values.get(speechKey)||0]});
  };
  const makeAllowance=()=>createGuestAllowance({now,fetchImpl,url:preview?'':'https://fixture.invalid',token:preview?'':'fixture',textLimit,speechLimit:30,textRate,speechRate:1});
  const allowances={status:makeAllowance(),chat:makeAllowance(),speech:makeAllowance()};
  const handlers=Object.fromEntries(Object.entries(allowances).map(([kind,guestAllowance])=>[kind,createAppServer({hosted:true,publicHosts:['nox.example'],accessToken:'owner',providers:[{id:'groq',name:'Groq',model:'fixture'}],apiKey:'',naturalVoice:true,speechProvider:'groq',speechKey:'fixture',now,guestAllowance,providerRequest:async()=>{providerCalls++;return packet;},speech:async()=>Buffer.from('fixture audio')}).listeners('request')[0]]));
  return {allowances,providerCalls:()=>providerCalls,request:(kind,path,body)=>request(handlers[kind],path,body)};
}

// Exercise the real route and serialization boundaries without opening sockets.
async function request(handler,path,body){
  const req=Object.assign(new EventEmitter(),{method:body?'POST':'GET',url:path,headers:{host:'nox.example',origin:'https://nox.example','content-type':'application/json','x-nox-guest':'1'},socket:{remoteAddress:'203.0.113.7'},aborted:false});
  const headers={},chunks=[];
  const res=Object.assign(new EventEmitter(),{statusCode:200,destroyed:false,writableEnded:false,headersSent:false,
    setHeader(name,value){headers[name.toLowerCase()]=value;},getHeader(name){return headers[name.toLowerCase()];},
    writeHead(status,values={}){this.statusCode=status;this.headersSent=true;for(const [name,value] of Object.entries(values))this.setHeader(name,value);},
    flushHeaders(){},write(value){chunks.push(Buffer.from(value));return true;},end(value){if(value!==undefined)chunks.push(Buffer.from(value));this.writableEnded=true;},
  });
  const completed=handler(req,res);
  if(body){req.emit('data',Buffer.from(JSON.stringify(body)));req.emit('end');}
  await completed;
  const text=Buffer.concat(chunks).toString();
  return {status:res.statusCode,headers,text,json:()=>JSON.parse(text)};
}
function usageOf(response,kind,stream){
  if(kind==='speech')return JSON.parse(response.headers['x-nox-usage']);
  if(!stream)return response.json().usage;
  return JSON.parse(response.text.split('\n\n').find(record=>record.startsWith('event: final\n')).split('\ndata: ')[1]).usage;
}
function assertPublic(usage){assert.equal(Object.hasOwn(usage,'rate'),false,'instance-local burst figures must not be presented as available capacity');}

test('an independent status handler keeps shared daily usage but does not claim another handler burst capacity',async()=>{
  // Question: Can a fresh status instance advertise capacity after chat is locally full?
  // Limits: Independent in-memory apps with synthetic shared Redis; no deployed topology/load proof.
  const app=fixture();
  for(let i=0;i<2;i++)assert.equal((await app.request('chat','/api/chat',{message:`Question ${i}`})).status,200);
  const blocked=await app.request('chat','/api/chat',{message:'Keep this draft.'});
  assert.equal(blocked.status,429);assert.equal(blocked.headers['retry-after'],60);assert.equal(blocked.json().retryAfter,60);assert.equal(app.providerCalls(),2);
  const status=await app.request('status','/api/status'),usage=status.json().usage;
  assert.equal(usage.text.used,2);assert.equal(usage.text.remaining,18);assertPublic(usage);
  const localChat=await app.allowances.chat.status('203.0.113.7'),localStatus=await app.allowances.status.status('203.0.113.7');
  assert.equal(localChat.rate.text.remaining,0);assert.equal(localStatus.rate.text.remaining,2,'local admission counters may remain internal');
});

for(const [kind,stream] of [['chat',false],['chat',true],['speech',false],['speech',true]])test(`${kind} ${stream?'streamed':'nonstream'} responses publish daily usage without process-local burst figures`,async()=>{
  // Question: Does this response mode retain accurate daily counts without burst claims?
  // Limits: Real handler serialization with synthetic transport; no socket/client-rendering evidence.
  const app=fixture(),body=kind==='chat'?{message:'A fixture question.',stream}:{text:'A fixture phrase.',stream};
  const response=await app.request(kind,`/api/${kind}`,body);assert.equal(response.status,200);
  const usage=usageOf(response,kind,stream);assert.equal(usage.mode,'daily');assert.equal(usage[kind==='chat'?'text':'speech'].used,1);assertPublic(usage);
  const status=(await app.request('status','/api/status')).json().usage;
  assert.equal(status[kind==='chat'?'text':'speech'].used,1);assertPublic(status);
});

for(const offline of [false,true])test(`${offline?'unavailable':'daily-limited'} allowance errors retain daily evidence and retry details without burst metadata`,async()=>{
  // Question: Does this denial preserve its real retry contract while omitting local figures?
  // Limits: Synthetic store decisions; no outage recovery, Redis load, or billing claim.
  const app=fixture({offline,textLimit:1});
  if(!offline)await app.request('chat','/api/chat',{message:'Accepted question.'});
  const response=await app.request('chat','/api/chat',{message:'Keep this question.'}),body=response.json();
  assert.equal(response.status,offline?503:429);assert.equal(body.code,offline?'allowance_unavailable':'daily_limit');assert.equal(response.headers['retry-after'],offline?30:43200);
  assert.equal(body.usage.text.used,offline?null:1);assert.equal(body.usage.text.remaining,offline?null:0);assertPublic(body.usage);
});

test('preview metadata stays explicitly unknown without publishing another instance local counters',async()=>{
  // Question: Does omitting local figures preserve the intentional preview/unknown policy?
  // Limits: No-Redis fixture only; no claim of durable allowance or global availability.
  const app=fixture({preview:true}),status=(await app.request('status','/api/status')).json().usage;
  assert.equal(status.mode,'preview');assert.equal(status.text.remaining,null);assertPublic(status);
  const response=await app.request('chat','/api/chat',{message:'Preview question.'}),usage=response.json().usage;
  assert.equal(usage.mode,'preview');assert.equal(usage.text.limit,null);assertPublic(usage);
});

test('shared admission rejection reuses daily evidence without reintroducing cached local burst figures',async()=>{
  // Question: Can the warm-process global gate leak local rate data from a cached snapshot?
  // Limits: One synthetic process at its existing gate; no deployment-wide ceiling claim.
  const app=fixture({textRate:100,textLimit:100});
  for(let i=0;i<24;i++)assert.equal((await app.request('chat','/api/chat',{message:`Question ${i}`})).status,200);
  const response=await app.request('chat','/api/chat',{message:'Keep this draft.'}),body=response.json();
  assert.equal(response.status,429);assert.equal(body.retryAfter,60);assert.equal(response.headers['retry-after'],60);
  assert.equal(body.usage.text.used,24);assertPublic(body.usage);assert.equal(app.providerCalls(),24);
});
