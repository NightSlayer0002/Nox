import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const run=promisify(execFile),script=fileURLToPath(new URL('../scripts/evaluate-conversation.mjs',import.meta.url));
async function fixture(check,{disconnect=false}={}){
  const root=await mkdtemp(join(tmpdir(),'nox-eval-'));let requests=0;
  const server=http.createServer((request,response)=>{
    requests++;request.resume();if(disconnect){request.destroy();return;}response.writeHead(200,{'content-type':'application/json'});
    response.end(JSON.stringify({speech:'The price is unchanged: 0%.',emotion:'curious',action:'none',memory:''}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  const evaluate=out=>run(process.execPath,[script,'--url',url,'--cases','ordinary-reasoning',...(out?['--out',out]:[])],{cwd:root,timeout:15000});
  try{await check({root,evaluate,requests:()=>requests});}
  finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(basename(root).startsWith('nox-eval-'));
    await rm(root,{recursive:true,force:true});
  }
}

test('evaluation creates its default output directory on a fresh checkout before checkpointing',()=>fixture(async({root,evaluate,requests})=>{
  await evaluate();const saved=JSON.parse(await readFile(join(root,'artifacts/conversation-evaluation.json'),'utf8'));
  assert.equal(requests(),1);assert.equal(saved.results.length,1);assert.equal(saved.results[0].id,'ordinary-reasoning');assert.equal(saved.results[0].assessment.structuralPass,true);
  assert.equal(saved.semanticReview,'unreviewed');assert.equal(saved.structuralPass,true);
  assert.deepEqual(saved.totals,{requested:1,attempted:1,completed:1,failed:0,structuralPassed:1});
}));

test('an unusable evaluation output path fails before spending any request',()=>fixture(async({root,evaluate,requests})=>{
  const out=join(root,'output-is-a-directory');await mkdir(out);
  await assert.rejects(evaluate(out));assert.equal(requests(),0,'output preflight must precede every provider request');
}));


test('output preflight preserves an existing report when the network request fails',()=>fixture(async({root,evaluate})=>{
  const out=join(root,'existing-report.json'),original=JSON.stringify({label:'previous run',results:[{id:'keep this checkpoint'}]});
  await writeFile(out,original);await assert.rejects(evaluate(out));assert.equal(await readFile(out,'utf8'),original);
},{disconnect:true}));

// Override only the transport in the actual child-process CLI. The fixture URL
// is never contacted and each attempted request is recorded on local disk.
async function synthetic(check,{status=200,packet={speech:'The price is unchanged: 0%.',emotion:'curious',action:'none',memory:''},body,failure}={}){
  const root=await mkdtemp(join(tmpdir(),'nox-eval-')),preload=join(root,'fetch-fixture.mjs'),log=join(root,'requests.log');
  await writeFile(preload,`import {appendFile} from 'node:fs/promises';\nconst fixture=${JSON.stringify({status,packet,body,failure,log})};\nconst schedule=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>schedule(fn,ms===21000?0:ms,...args);\nglobalThis.fetch=async()=>{await appendFile(fixture.log,'request\\n');if(fixture.failure==='abort')throw new DOMException('Fixture canceled.','AbortError');return new Response(fixture.body??JSON.stringify(fixture.packet),{status:fixture.status,headers:{'content-type':'application/json'}});};\n`);
  const evaluate=args=>run(process.execPath,['--import',pathToFileURL(preload).href,script,...args],{cwd:root,timeout:15000});
  const requests=async()=>{try{return (await readFile(log,'utf8')).trim().split('\n').length;}catch(error){if(error.code==='ENOENT')return 0;throw error;}};
  try{await check({root,evaluate,requests});}
  finally{assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(basename(root).startsWith('nox-eval-'));await rm(root,{recursive:true,force:true});}
}
const urlArgs=['--url','https://fixture.invalid'];
const invalidArgs=[
  ['unknown cases',['--cases','not-a-case']],
  ['mixed known and unknown cases',['--cases','ordinary-reasoning,not-a-case']],
  ['empty case selection',['--cases','']],
  ['empty entries in case selection',['--cases',',']],
  ['missing case value',['--cases']],
  ['a flag in place of the case value',['--cases','--label','probe']],
  ['missing output value',['--out']],
  ['blank output value',['--out',' ']],
  ['missing label value',['--label']],
  ['blank label value',['--label',' ']],
  ['unknown flag',['--unknown','value']],
];
for(const [name,args] of invalidArgs)test(`evaluation rejects ${name} before output preflight or requests`,()=>synthetic(async({root,evaluate,requests})=>{
  await assert.rejects(evaluate([...urlArgs,...args]),error=>error.code===1);
  assert.equal(await requests(),0);assert.deepEqual(await readdir(root),['fetch-fixture.mjs']);
}));
for(const [name,args] of [['missing URL value',['--url']],['non-HTTP URL',['--url','file:///fixture']]])test(`evaluation rejects ${name} before output preflight or requests`,()=>synthetic(async({root,evaluate,requests})=>{
  await assert.rejects(evaluate(args),error=>error.code===1);assert.equal(await requests(),0);assert.deepEqual(await readdir(root),['fetch-fixture.mjs']);
}));

test('HTTP failure checkpoints its response and totals before the CLI exits unsuccessfully',()=>synthetic(async({root,evaluate,requests})=>{
  await assert.rejects(evaluate([...urlArgs,'--cases','ordinary-reasoning,unavailable-vision']),error=>error.code===1);
  const saved=JSON.parse(await readFile(join(root,'artifacts/conversation-evaluation.json'),'utf8'));
  assert.equal(await requests(),1);assert.equal(saved.results[0].status,503);assert.equal(saved.results[0].assessment,null);
  assert.equal(saved.structuralPass,false);assert.equal(saved.semanticReview,'unreviewed');
  assert.deepEqual(saved.totals,{requested:2,attempted:1,completed:1,failed:1,structuralPassed:0});
},{status:503,packet:{error:'Synthetic unavailable response.'}}));

for(const [name,packet] of [['empty speech',{speech:' ',action:'none'}],['an unexpected action',{speech:'A reply.',action:'gravity'}]])test(`evaluation checkpoints ${name} and returns a failing structural result`,()=>synthetic(async({root,evaluate})=>{
  await assert.rejects(evaluate([...urlArgs,'--cases','ordinary-reasoning']),error=>error.code===1);
  const saved=JSON.parse(await readFile(join(root,'artifacts/conversation-evaluation.json'),'utf8'));
  assert.equal(saved.results[0].assessment.structuralPass,false);assert.equal(saved.results[0].assessment.semanticReview,'unreviewed');
  assert.ok(saved.results[0].assessment.failures.length);assert.deepEqual(saved.totals,{requested:1,attempted:1,completed:1,failed:1,structuralPassed:0});
},{packet}));

for(const [name,fixture] of [['malformed JSON',{body:'not JSON'}],['an aborted request',{failure:'abort'}]])test(`${name} preserves previous evidence and reports an incomplete failed run`,()=>synthetic(async({root,evaluate,requests})=>{
  const out=join(root,'previous.json'),original=JSON.stringify({label:'previous evidence',results:[{id:'keep-me'}]});await writeFile(out,original);
  let stdout;
  await assert.rejects(evaluate([...urlArgs,'--cases','ordinary-reasoning','--out',out]),error=>{stdout=error.stdout;return error.code===1;});
  assert.equal(await readFile(out,'utf8'),original);assert.equal(await requests(),1);
  const summary=stdout.trim().split('\n').map(JSON.parse).find(row=>row.type==='summary');
  assert.equal(summary.structuralPass,false);assert.equal(summary.semanticReview,'unreviewed');
  assert.deepEqual(summary.totals,{requested:1,attempted:1,completed:0,failed:1,structuralPassed:0});
},fixture));

for(const [id,speech] of [['ordinary-reasoning','The net change is a 5% increase.'],['unavailable-vision','I can see that you are wearing a red shirt.']])test(`structurally valid wrong ${id} output remains semantically unreviewed`,()=>synthetic(async({root,evaluate})=>{
  const {stdout}=await evaluate([...urlArgs,'--cases',id]);
  const saved=JSON.parse(await readFile(join(root,'artifacts/conversation-evaluation.json'),'utf8')),assessment=saved.results[0].assessment;
  assert.equal(assessment.structuralPass,true);assert.equal(assessment.semanticReview,'unreviewed');assert.equal('pass' in assessment,false);assert.ok(assessment.manualReview);
  assert.equal(saved.semanticReview,'unreviewed');assert.equal(saved.structuralPass,true);
  const summary=stdout.trim().split('\n').map(JSON.parse).find(row=>row.type==='summary');assert.equal(summary.semanticReview,'unreviewed');
},{packet:{speech,emotion:'curious',action:'none',memory:''}}));
