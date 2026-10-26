import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
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
  assert.equal(requests(),1);assert.equal(saved.results.length,1);assert.equal(saved.results[0].id,'ordinary-reasoning');assert.equal(saved.results[0].assessment.pass,true);
}));

test('an unusable evaluation output path fails before spending any request',()=>fixture(async({root,evaluate,requests})=>{
  const out=join(root,'output-is-a-directory');await mkdir(out);
  await assert.rejects(evaluate(out));assert.equal(requests(),0,'output preflight must precede every provider request');
}));


test('output preflight preserves an existing report when the network request fails',()=>fixture(async({root,evaluate})=>{
  const out=join(root,'existing-report.json'),original=JSON.stringify({label:'previous run',results:[{id:'keep this checkpoint'}]});
  await writeFile(out,original);await assert.rejects(evaluate(out));assert.equal(await readFile(out,'utf8'),original);
},{disconnect:true}));
