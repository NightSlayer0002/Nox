import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
const run=promisify(execFile),script=fileURLToPath(new URL('../scripts/compare-conversation.mjs',import.meta.url));
const report=(label,speech)=>({schemaVersion:2,label,semanticReview:'unreviewed',totals:{requested:1},policyReference:{version:label+'-policy'},requestedCases:['sample'],
  rubric:{version:'fixture-rubric',instructions:'Review the full conversation.',dimensions:[{id:'understanding',anchors:['Misses intent.','Partly understands.','Understands.']}]},
  results:[{id:'sample',turn:1,status:200,request:{message:'A fictional question.',context:{mode:'companion',history:[]}},packet:{speech,action:'none'},observed:{model:label+'-model'},assessment:{manualReview:'Respond to this question.',semanticReview:'unreviewed'}}]});
async function fixture(check){
  const root=await mkdtemp(join(tmpdir(),'nox-review-')),left=join(root,'left.json'),right=join(root,'right.json'),out=join(root,'review');
  await writeFile(left,JSON.stringify(report('secret-left','First actual answer.')));await writeFile(right,JSON.stringify(report('secret-right','Second actual answer.')));
  const compare=()=>run(process.execPath,[script,'--left',left,'--right',right,'--out',out],{cwd:root,timeout:10000});
  try{await check({root,left,right,out,compare});}
  finally{assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(basename(root).startsWith('nox-review-'));await rm(root,{recursive:true,force:true});}
}

test('offline comparison hides run metadata while keeping full transcripts and empty human scores',()=>fixture(async({out,compare})=>{
  // Question: Does the reviewer handoff leak model labels or fabricate scores instead of showing actual responses?
  // Limits: Metadata blinding only; a response may reveal its origin through its own wording. No human review occurs here.
  await compare();
  const review=await readFile(join(out,'review.md'),'utf8'),scores=JSON.parse(await readFile(join(out,'scores.json'),'utf8')),key=JSON.parse(await readFile(join(out,'answer-key.json'),'utf8'));
  assert.match(review,/First actual answer\./);assert.match(review,/Second actual answer\./);assert.match(review,/A fictional question\./);assert.doesNotMatch(review,/secret-left|secret-right|left\.json|right\.json/);
  assert.equal(scores.semanticReview,'unreviewed');assert.equal(scores.reviewer,null);assert.equal(scores.cases[0].preference,null);assert.equal(scores.cases[0].ratings.A.understanding,null);assert.equal(scores.cases[0].ratings.B.understanding,null);
  assert.deepEqual(new Set(Object.values(key.assignments.sample)),new Set(['left','right']));assert.equal(key.runs.left.label,'secret-left');
}));

test('mismatched user turns are rejected before creating a misleading comparison',()=>fixture(async({root,right,compare})=>{
  // Question: Can unlike prompts be presented as an aligned two-run comparison?
  // Limits: Exact input compatibility, not proof that models had equal hidden system prompts or sampling conditions.
  const changed=report('secret-right','Second answer.');changed.results[0].request.message='A different question.';await writeFile(right,JSON.stringify(changed));
  await assert.rejects(compare(),error=>error.code===1&&/same user turns and starting context/.test(error.stderr));assert.deepEqual((await readdir(root)).sort(),['left.json','right.json']);
}));

test('incomplete runs cannot be passed off as a complete blinded conversation comparison',()=>fixture(async({root,right,compare})=>{
  // Question: Can missing later replies disappear from the review handoff?
  // Limits: Completeness follows recorded counts; this cannot validate authenticity of an edited input report.
  const changed=report('secret-right','Only one answer.');changed.totals.requested=2;await writeFile(right,JSON.stringify(changed));
  await assert.rejects(compare(),error=>error.code===1&&/complete successful responses/.test(error.stderr));assert.deepEqual((await readdir(root)).sort(),['left.json','right.json']);
}));
