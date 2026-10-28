// Explicit opt-in probes. Fictional inputs only, one request at a time, no retry.
import {writeFile,mkdir,open} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {CONVERSATION_SCENARIOS,assessScenario} from './conversation-scenarios.mjs';

function options(args){
  const flags=new Set(['--url','--out','--label','--cases']),seen=new Set();
  const values={'--out':'artifacts/conversation-evaluation.json','--label':'probe','--cases':'already-done,negated-command,capability-question'};
  for(let i=0;i<args.length;i+=2){
    const flag=args[i],value=args[i+1];
    if(!flags.has(flag))throw Error(`Unknown evaluation option: ${flag}.`);
    if(seen.has(flag))throw Error(`Supply ${flag} only once.`);
    if(!value?.trim()||value.startsWith('--'))throw Error(`Supply a nonempty value for ${flag}.`);
    seen.add(flag);values[flag]=value;
  }
  if(!values['--url'])throw Error('Supply --url explicitly. These probes consume the normal public allowance.');
  let url;
  try{url=new URL(values['--url']);}catch{throw Error('Supply an absolute HTTP or HTTPS --url.');}
  if(!['http:','https:'].includes(url.protocol))throw Error('Supply an absolute HTTP or HTTPS --url.');
  const names=values['--cases'].split(',').map(name=>name.trim()),scenarios=new Map(CONVERSATION_SCENARIOS.map(scenario=>[scenario.id,scenario]));
  if(names.some(name=>!name))throw Error('Supply a nonempty comma-separated list of case names.');
  const unknown=names.filter(name=>!scenarios.has(name));
  if(unknown.length)throw Error(`Unknown evaluation case: ${unknown.join(', ')}.`);
  if(new Set(names).size!==names.length)throw Error('Each evaluation case may be selected only once.');
  return {url,out:values['--out'],label:values['--label'],selected:names.map(name=>scenarios.get(name))};
}

async function evaluate(){
  // Validate every option before creating output or consuming allowance.
  const {url,out,label,selected}=options(process.argv.slice(2));
  // Append-open checks writability without truncating earlier evidence when a
  // request then fails or returns an unreadable response.
  await mkdir(dirname(out),{recursive:true});
  const checkpoint=await open(out,'a');
  try{if(!(await checkpoint.stat()).isFile())throw Error('The evaluation output must be a regular file.');}
  finally{await checkpoint.close();}
  const visit=randomUUID(),results=[],failedCases=new Set(),at=new Date().toISOString();
  let attempted=0,current,stage,interrupted;
  const report=()=>({
    label,at,configuration:{origin:url.origin,mode:'companion',depth:'quick'},requestedCases:selected.map(scenario=>scenario.id),
    structuralPass:results.length===selected.length&&failedCases.size===0,semanticReview:'unreviewed',
    totals:{requested:selected.length,attempted,completed:results.length,failed:failedCases.size,structuralPassed:results.filter(result=>result.assessment?.structuralPass).length},results,
  });
  try{
    for(const scenario of selected){
      if(attempted)await new Promise(resolve=>setTimeout(resolve,21000));
      current=scenario.id;stage='request';attempted++;
      const started=performance.now();
      const response=await fetch(new URL('/api/chat',url),{method:'POST',headers:{'content-type':'application/json',origin:url.origin,'x-nox-guest':'1','x-nox-visit-id':visit},body:JSON.stringify({message:scenario.message,context:{...scenario.context,mode:'companion',depth:'quick'}}),signal:AbortSignal.timeout(30000)});
      stage='response';const packet=await response.json();
      const result={id:scenario.id,status:response.status,elapsedMs:Math.round(performance.now()-started),packet,assessment:response.ok?assessScenario(scenario,packet):null};
      if(!response.ok||!result.assessment.structuralPass)failedCases.add(current);
      results.push(result);console.log(JSON.stringify(result));
      stage='checkpoint';await writeFile(out,JSON.stringify(report(),null,2));
      if(!response.ok)break;
    }
  }catch(error){
    failedCases.add(current);
    const kind=error.name==='AbortError'||error.name==='TimeoutError'?'aborted':stage==='response'?'invalid_json':stage==='checkpoint'?'checkpoint':'transport';
    interrupted={id:current,kind};
    console.error(`Evaluation stopped during ${current}: ${kind}. ${kind==='checkpoint'?'The output checkpoint could not be saved.':'Earlier checkpoints are preserved.'}`);
  }
  const {structuralPass,semanticReview,totals}=report();
  console.log(JSON.stringify({type:'summary',label,structuralPass,semanticReview,totals,...(interrupted?{error:interrupted}:{})}));
  if(!structuralPass)process.exitCode=1;
}

try{await evaluate();}
catch(error){console.error(`Evaluation could not start: ${error.message}`);process.exitCode=1;}
