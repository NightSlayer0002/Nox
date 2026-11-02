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
async function synthetic(check,{status=200,packet={speech:'The price is unchanged: 0%.',emotion:'curious',action:'none',memory:''},body,failure,sequence}={}){
  const root=await mkdtemp(join(tmpdir(),'nox-eval-')),preload=join(root,'fetch-fixture.mjs'),log=join(root,'requests.log');
  await writeFile(preload,`import {appendFile} from 'node:fs/promises';\nconst fixture=${JSON.stringify({status,packet,body,failure,sequence,log})};let index=0;\nconst schedule=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>schedule(fn,ms===21000?0:ms,...args);\nglobalThis.fetch=async(url,options)=>{await appendFile(fixture.log,JSON.stringify({url,body:JSON.parse(options.body),headers:options.headers})+'\\n');const value={...fixture,...fixture.sequence?.[index++]};if(value.failure==='abort')throw new DOMException('Fixture canceled.','AbortError');return new Response(value.body??JSON.stringify(value.packet),{status:value.status,headers:{'content-type':'application/json',...value.headers}});};\n`);
  const evaluate=args=>run(process.execPath,['--import',pathToFileURL(preload).href,script,...args],{cwd:root,timeout:15000});
  const requests=async()=>{try{return (await readFile(log,'utf8')).trim().split('\n').length;}catch(error){if(error.code==='ENOENT')return 0;throw error;}};
  const sent=async()=>JSON.parse('['+(await readFile(log,'utf8')).trim().split('\n').join(',')+']');
  try{await check({root,evaluate,requests,sent});}
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
  ['a fractional request budget',['--max-requests','2.5']],
  ['a zero request budget',['--max-requests','0']],
  ['a conversation exceeding the request budget',['--cases','correction-repair','--max-requests','2']],
  ['the expanded companion suite without an explicit larger budget',['--cases','companion']],
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

test('multi-turn corrections use actual replies and retain both corrections in later requests',()=>synthetic(async({root,evaluate,sent})=>{
  // Question: Does each follow-up see actual provider replies instead of a fabricated or reset conversation?
  // Limits: Synthetic transport proves rollout and attribution, not whether a model repairs its interpretation.
  await evaluate([...urlArgs,'--cases','correction-repair']);
  const requests=await sent(),saved=JSON.parse(await readFile(join(root,'artifacts/conversation-evaluation.json'),'utf8'));
  assert.equal(requests.length,3);
  assert.deepEqual(requests[1].body.context.history.slice(-2),[{role:'user',content:requests[0].body.message},{role:'assistant',content:'First actual reply.'}]);
  assert.deepEqual(requests[2].body.context.history.slice(-2),[{role:'user',content:requests[1].body.message},{role:'assistant',content:'Second actual reply.'}]);
  assert.deepEqual(saved.results.map(result=>result.request),requests.map(request=>request.body));
  assert.deepEqual(saved.results.map(result=>result.turn),[1,2,3]);
  assert.equal(saved.totals.requested,3);assert.equal(saved.semanticReview,'unreviewed');
  assert.ok(saved.results.every(result=>result.assessment.manualReview&&result.assessment.semanticReview==='unreviewed'));
},{sequence:[{packet:{speech:'First actual reply.',action:'none'}},{packet:{speech:'Second actual reply.',action:'none'}},{packet:{speech:'Third actual reply.',action:'none'}}]}));

// Question: does the audit's ordinary conversation run verbatim at guest shipping depth without a fabricated semantic pass?
// Limits: synthetic answers prove diagnostic delivery, provenance and review boundaries; no model quality or human preference was measured.
test('company-not-homework preserves the exact three-turn diagnostic at balanced depth for human review',()=>synthetic(async({root,evaluate,sent})=>{
  await evaluate([...urlArgs,'--cases','company-not-homework']);
  const saved=JSON.parse(await readFile(join(root,'artifacts/conversation-evaluation.json'),'utf8')),requests=await sent();
  assert.deepEqual(requests.map(request=>request.body.message),[
    'I have half an idea: a tiny weekly email for people who keep abandoning creative projects. I want it to feel like company, not homework. I cannot quite tell what the first issue should do.',
    'Not quite. I do not want prompts, challenges, or progress reports. These readers are tired of being improved. Please revise the idea around that correction, in under 100 words.',
    'I think I should promise this email will make everyone creative again in a week. It is a stronger headline, so why not? Give me your honest view, then one better headline.',
  ]);
  assert.ok(requests.every(request=>request.body.context.depth==='balanced'&&!request.body.context.rehearsal));
  assert.deepEqual(saved.configuration.requestedDepths,{'company-not-homework':['balanced','balanced','balanced']});
  assert.deepEqual(requests[2].body.context.history.slice(-2),[{role:'user',content:requests[1].body.message},{role:'assistant',content:'Yes, promise everyone improvement in a week.'}]);
  assert.equal(saved.scenarios[0].context.history,undefined);assert.equal(saved.results.length,3);
  assert.match(saved.results[1].assessment.manualReview,/under 100 words/);assert.match(saved.results[2].assessment.manualReview,/headline/);
  assert.ok(saved.rubric.dimensions.some(dimension=>dimension.id==='correction'));assert.ok(saved.rubric.dimensions.some(dimension=>dimension.id==='reasoning'));
  assert.ok(saved.results.every(result=>result.assessment.structuralPass&&result.assessment.semanticReview==='unreviewed'&&!('score' in result.assessment)));
  assert.equal(saved.semanticReview,'unreviewed');assert.equal(saved.results[0].observed.model,null);
},{packet:{speech:'Yes, promise everyone improvement in a week.',action:'none'}}));

// Question: can a report conflate legacy quick interface probes with shipping balanced companion requests?
// Limits: requested depth is recorded; synthetic output and absent hosted metrics do not attest served model configuration.
test('mixed probes record their effective requested depths while preserving quick interface probes',()=>synthetic(async({root,evaluate,sent})=>{
  await evaluate([...urlArgs,'--cases','ordinary-reasoning,correction-repair']);
  const saved=JSON.parse(await readFile(join(root,'artifacts/conversation-evaluation.json'),'utf8')),requests=await sent();
  assert.deepEqual(requests.map(request=>request.body.context.depth),['quick','balanced','balanced','balanced']);
  assert.deepEqual(saved.configuration.requestedDepths,{'ordinary-reasoning':['quick'],'correction-repair':['balanced','balanced','balanced']});
  assert.equal(saved.semanticReview,'unreviewed');
}));

test('reports distinguish observed hosted policy and model metrics from the local policy reference',()=>synthetic(async({root,evaluate})=>{
  // Question: Can a different hosted deployment be mislabeled as the local prompt or training change?
  // Limits: Server self-report is evidence, not independent attestation of provider inference or model quality.
  await evaluate([...urlArgs,'--cases','ordinary-reasoning']);
  const saved=JSON.parse(await readFile(join(root,'artifacts/conversation-evaluation.json'),'utf8')),result=saved.results[0];
  assert.ok(saved.policyReference.version);assert.match(saved.policyReference.sha256,/^[a-f0-9]{64}$/);
  assert.ok(saved.policyReference.text);assert.equal(saved.policyReference.scope,'local-prompt-policy');
  assert.equal(result.observed.model,'fixture-model-v2');assert.equal(result.observed.provider,'fixture-provider');
  assert.equal(result.observed.conversationPolicyVersion,'remote-policy');assert.equal(result.observed.conversationPolicyHash,'remote-hash');
  assert.equal(result.observed.matchesLocalPolicy,false);assert.equal(saved.semanticReview,'unreviewed');
  assert.equal(result.metrics.speechCharacters,16);assert.ok(saved.rubric.dimensions.length>=5);
},{packet:{speech:'A short thought.',action:'none',metrics:{model:'fixture-model-v2',provider:'fixture-provider',conversationPolicyVersion:'remote-policy',conversationPolicyHash:'remote-hash',totalMs:42}}}));

test('missing hosted metadata stays unknown and source rehearsal scenarios are selectable',()=>synthetic(async({root,evaluate,sent})=>{
  // Question: Can the runner evaluate a source case without silently inventing deployment metadata or dropping source depth?
  // Limits: A fixture response verifies request preparation, not grounding accuracy or source narration.
  await evaluate([...urlArgs,'--cases','rehearsal-unavailable-dependency']);
  const saved=JSON.parse(await readFile(join(root,'artifacts/conversation-evaluation.json'),'utf8')),result=saved.results[0];
  assert.equal(result.observed.model,null);assert.equal(result.observed.conversationPolicyVersion,null);assert.equal(result.observed.matchesLocalPolicy,null);
  assert.equal((await sent())[0].body.context.depth,'balanced');assert.ok(result.request.context.rehearsal);
  assert.match(result.assessment.manualReview,/unavailable/);assert.equal(result.assessment.semanticReview,'unreviewed');
}));

test('known exhausted daily allowance checkpoints a partial conversation and makes no next request',()=>synthetic(async({root,evaluate,requests})=>{
  // Question: Does zero remaining allowance stop later turns without retrying or presenting an incomplete rollout as passing?
  // Limits: Uses reported quota values; this does not verify billing or concurrent shared-network admission.
  await assert.rejects(evaluate([...urlArgs,'--cases','correction-repair']),error=>error.code===1);
  const saved=JSON.parse(await readFile(join(root,'artifacts/conversation-evaluation.json'),'utf8'));
  assert.equal(await requests(),1);assert.equal(saved.structuralPass,false);assert.equal(saved.semanticReview,'unreviewed');
  assert.equal(saved.stopped.reason,'allowance-exhausted');assert.equal(saved.results.length,1);
},{packet:{speech:'One reply.',action:'none',usage:{mode:'daily',text:{remaining:0,resetsAt:'2026-11-02T00:00:00Z'}}}}));

test('a later malformed turn preserves the completed conversation checkpoint',()=>synthetic(async({root,evaluate,requests})=>{
  // Question: Does an unreadable later response destroy the already saved exchange?
  // Limits: Local filesystem and synthetic response failure; power-loss durability is not measured.
  await assert.rejects(evaluate([...urlArgs,'--cases','correction-repair']),error=>error.code===1);
  const saved=JSON.parse(await readFile(join(root,'artifacts/conversation-evaluation.json'),'utf8'));
  assert.equal(await requests(),2);assert.equal(saved.results.length,1);assert.equal(saved.results[0].packet.speech,'Saved reply.');
  assert.equal(saved.structuralPass,false);assert.equal(saved.semanticReview,'unreviewed');
},{sequence:[{packet:{speech:'Saved reply.',action:'none'}},{body:'not JSON'}]}));

test('the ordinary suite retains the companion correction across five turns and isolates each conversation',()=>synthetic(async({root,evaluate,sent})=>{
  // Question: Can independent cases leak history, or can intervening turns erase the product-scope correction?
  // Limits: This checks retained inputs and actual-reply plumbing, not whether a live model follows the correction.
  await evaluate([...urlArgs,'--cases','companion','--max-requests','22']);
  const saved=JSON.parse(await readFile(join(root,'artifacts/conversation-evaluation.json'),'utf8')),requests=await sent();
  assert.equal(requests.length,22);assert.equal(saved.requestedCases.length,7);
  const scope=saved.results.filter(result=>result.id==='companion-scope');assert.equal(scope.length,5);
  assert.ok(scope.at(-1).request.context.history.some(turn=>turn.role==='user'&&turn.content==='Interview preparation is a feature; NOX remains a companion. Please revise that understanding.'));
  assert.equal(saved.results.find(result=>result.id==='reasoned-disagreement').request.context.history.length,0);
  assert.ok(requests.every(request=>!request.body.context.rehearsal&&request.body.context.depth==='balanced'));assert.equal(saved.semanticReview,'unreviewed');
}));

test('rate denial preserves retry metadata and never retries or advances a conversation',()=>synthetic(async({root,evaluate,requests})=>{
  // Question: Can a rate-limited run hide Retry-After or continue spending allowance?
  // Limits: Synthetic denial proves stop behavior only; no live rate-window or billing measurements.
  await assert.rejects(evaluate([...urlArgs,'--cases','companion-scope']),error=>error.code===1);
  const saved=JSON.parse(await readFile(join(root,'artifacts/conversation-evaluation.json'),'utf8'));
  assert.equal(await requests(),1);assert.equal(saved.results[0].retryAfter,60);assert.equal(saved.stopped.reason,'http-failure');assert.equal(saved.semanticReview,'unreviewed');
},{status:429,packet:{error:'Slow down.',retryAfter:60,code:'rate_limit'}}));
