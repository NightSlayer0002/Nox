// Explicit opt-in probes. Fictional inputs only, one request at a time, no retry.
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {CONVERSATION_SCENARIOS,assessScenario} from './conversation-scenarios.mjs';
const args=process.argv.slice(2),arg=(key,fallback)=>{const at=args.indexOf(key);return at<0?fallback:args[at+1];};
const base=arg('--url',''),out=arg('--out','artifacts/conversation-evaluation.json'),label=arg('--label','probe');
if(!base)throw Error('Supply --url explicitly. These probes consume the normal public allowance.');
const url=new URL(base),names=arg('--cases','already-done,negated-command,capability-question').split(',');
const visit=randomUUID(),results=[];
for(const scenario of CONVERSATION_SCENARIOS.filter(value=>names.includes(value.id))){
  if(results.length)await new Promise(resolve=>setTimeout(resolve,21000));
  const started=performance.now();
  const response=await fetch(new URL('/api/chat',url),{method:'POST',headers:{'content-type':'application/json',origin:url.origin,'x-nox-guest':'1','x-nox-visit-id':visit},body:JSON.stringify({message:scenario.message,context:{...scenario.context,mode:'companion',depth:'quick'}}),signal:AbortSignal.timeout(30000)});
  const packet=await response.json();
  const result={id:scenario.id,status:response.status,elapsedMs:Math.round(performance.now()-started),packet,assessment:response.ok?assessScenario(scenario,packet):null};
  results.push(result);console.log(JSON.stringify(result));
  await writeFile(out,JSON.stringify({label,at:new Date().toISOString(),results},null,2));
  if(!response.ok)break;
}
