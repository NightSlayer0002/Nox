// Explicit opt-in hosted probes. Fictional inputs, sequential requests, no retry.
// This records behavior for human review; it does not train a model or grade it.
import {writeFile,mkdir,open} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {prepareChatRequest,answerDepth} from '../shared/character.js';
import {IDENTITY,answerInstructions} from '../server/ai.mjs';
import {CONVERSATION_POLICY,CONVERSATION_POLICY_VERSION,CONVERSATION_POLICY_SHA256} from '../server/conversation-policy.mjs';
import {CONVERSATION_SCENARIOS,COMPANION_SCENARIOS,CONVERSATION_RUBRIC,scenarioTurns,assessScenario} from './conversation-scenarios.mjs';
import {REHEARSAL_SCENARIOS} from './rehearsal-scenarios.mjs';

const rehearsalCases=REHEARSAL_SCENARIOS.map(scenario=>({...scenario,id:'rehearsal-'+scenario.id}));
const requestedDepth=(scenario,step)=>answerDepth(step.context?.depth??scenario.context?.depth??'quick');
function options(args){
  const flags=new Set(['--url','--out','--label','--cases','--max-requests']),seen=new Set();
  const values={'--out':'artifacts/conversation-evaluation.json','--label':'probe','--cases':'correction-repair','--max-requests':'20'};
  for(let i=0;i<args.length;i+=2){
    const flag=args[i],value=args[i+1];
    if(!flags.has(flag))throw Error('Unknown evaluation option: '+flag+'.');
    if(seen.has(flag))throw Error('Supply '+flag+' only once.');
    if(!value?.trim()||value.startsWith('--'))throw Error('Supply a nonempty value for '+flag+'.');
    seen.add(flag);values[flag]=value;
  }
  if(!values['--url'])throw Error('Supply --url explicitly. These probes consume the normal public allowance.');
  let url;
  try{url=new URL(values['--url']);}catch{throw Error('Supply an absolute HTTP or HTTPS --url.');}
  if(!['http:','https:'].includes(url.protocol))throw Error('Supply an absolute HTTP or HTTPS --url.');
  const names=values['--cases']==='companion'?COMPANION_SCENARIOS.map(scenario=>scenario.id):values['--cases']==='rehearsal'?rehearsalCases.map(scenario=>scenario.id):values['--cases'].split(',').map(name=>name.trim());
  const scenarios=new Map([...CONVERSATION_SCENARIOS,...COMPANION_SCENARIOS,...rehearsalCases].map(scenario=>[scenario.id,scenario]));
  if(names.some(name=>!name))throw Error('Supply a nonempty comma-separated list of case names.');
  const unknown=names.filter(name=>!scenarios.has(name));
  if(unknown.length)throw Error('Unknown evaluation case: '+unknown.join(', ')+'.');
  if(new Set(names).size!==names.length)throw Error('Each evaluation case may be selected only once.');
  const selected=names.map(name=>scenarios.get(name)),requested=selected.reduce((sum,scenario)=>sum+scenarioTurns(scenario).length,0),maxRequests=Number(values['--max-requests']);
  if(!/^\d+$/.test(values['--max-requests'])||!Number.isSafeInteger(maxRequests)||maxRequests<1||maxRequests>100)throw Error('Supply --max-requests as an integer from 1 to 100.');
  if(requested>maxRequests)throw Error('Selected conversations require '+requested+' requests, exceeding --max-requests '+maxRequests+'. Select fewer cases or explicitly raise the budget.');
  return {url,out:values['--out'],label:values['--label'],selected,requested,maxRequests};
}

function observed(packet){
  const metrics=packet?.metrics||{},version=metrics.conversationPolicyVersion,hash=metrics.conversationPolicyHash;
  return {
    source:'server-response-metrics',provider:metrics.provider??null,model:metrics.model??null,
    conversationPolicyVersion:version??null,conversationPolicyHash:hash??null,
    matchesLocalPolicy:typeof version==='string'&&typeof hash==='string'?version===CONVERSATION_POLICY_VERSION&&hash===CONVERSATION_POLICY_SHA256:null,
  };
}

async function evaluate(){
  // Validate every option and the explicit request budget before spending quota.
  const {url,out,label,selected,requested,maxRequests}=options(process.argv.slice(2));
  // Append-open checks writability without truncating previous evidence.
  await mkdir(dirname(out),{recursive:true});
  const checkpoint=await open(out,'a');
  try{if(!(await checkpoint.stat()).isFile())throw Error('The evaluation output must be a regular file.');}
  finally{await checkpoint.close();}
  const visit=randomUUID(),results=[],failedTurns=new Set(),at=new Date().toISOString();
  let attempted=0,current,turn,stage,interrupted,stopped;
  const report=()=>({
    schemaVersion:2,label,at,configuration:{origin:url.origin,endpoint:'/api/chat',mode:'companion',depth:'per-case',requestedDepths:Object.fromEntries(selected.map(scenario=>[scenario.id,scenarioTurns(scenario).map(step=>requestedDepth(scenario,step))])),guest:true,maxRequests,minimumGapMs:21000,retries:0},
    policyReference:{scope:'local-prompt-policy',version:CONVERSATION_POLICY_VERSION,sha256:CONVERSATION_POLICY_SHA256,text:CONVERSATION_POLICY},
    promptReference:{scope:'local-only; hosted system prompt and deployment are not independently inspected',identity:IDENTITY,identitySha256:createHash('sha256').update(IDENTITY).digest('hex')},
    requestedCases:selected.map(scenario=>scenario.id),scenarios:selected,rubric:CONVERSATION_RUBRIC,
    structuralPass:results.length===requested&&failedTurns.size===0,semanticReview:'unreviewed',
    totals:{requested,attempted,completed:results.length,failed:failedTurns.size,structuralPassed:results.filter(result=>result.assessment?.structuralPass).length},
    ...(stopped?{stopped}:{}),results,
  });
  try{
    conversations:for(const scenario of selected){
      let history=[...(scenario.context?.history||[])];
      const turns=scenarioTurns(scenario);
      for(let index=0;index<turns.length;index++){
        if(attempted)await new Promise(resolve=>setTimeout(resolve,21000));
        current=scenario.id;turn=index+1;stage='request';
        const step=turns[index],context={...scenario.context,...step.context,history,mode:'companion'};
        context.depth=requestedDepth(scenario,step);
        const request=prepareChatRequest(step.message,context),started=performance.now();
        attempted++;
        const response=await fetch(new URL('/api/chat',url),{method:'POST',headers:{'content-type':'application/json',origin:url.origin,'x-nox-guest':'1','x-nox-visit-id':visit},body:JSON.stringify(request),signal:AbortSignal.timeout(30000)});
        stage='response';const packet=await response.json();
        const assessment=response.ok?assessScenario({...scenario,review:[scenario.review,step.review].filter((value,index,all)=>value&&all.indexOf(value)===index).join(' ')},packet):null;
        const result={id:scenario.id,turn,status:response.status,elapsedMs:Math.round(performance.now()-started),request,localAnswerInstructions:answerInstructions(request.context),packet,observed:observed(packet),
          metrics:{speechCharacters:typeof packet?.speech==='string'?packet.speech.length:0,speechWords:typeof packet?.speech==='string'?packet.speech.trim().split(/\s+/).filter(Boolean).length:0,server:packet?.metrics??null},
          retryAfter:response.headers.get('retry-after')??packet?.retryAfter??null,assessment};
        if(!response.ok||!assessment.structuralPass)failedTurns.add(current+':'+turn);
        results.push(result);console.log(JSON.stringify(result));
        if(!response.ok)stopped={reason:'http-failure',id:current,turn,status:response.status,retryAfter:result.retryAfter};
        else if(packet?.usage?.mode==='daily'&&packet.usage.text?.remaining===0&&results.length<requested)stopped={reason:'allowance-exhausted',id:current,turn,resetsAt:packet.usage.text.resetsAt??null};
        else if(typeof packet?.speech!=='string'||!packet.speech.trim())stopped={reason:'missing-assistant-reply',id:current,turn};
        stage='checkpoint';await writeFile(out,JSON.stringify(report(),null,2));
        if(stopped)break conversations;
        // Carry actual output forward, preserving attribution. Request building
        // applies the same bounded-history rules used by the normal client.
        history=[...request.context.history,{role:'user',content:request.message},{role:'assistant',content:packet.speech}];
      }
    }
  }catch(error){
    failedTurns.add(current+':'+turn);
    const kind=error.name==='AbortError'||error.name==='TimeoutError'?'aborted':stage==='response'?'invalid_json':stage==='checkpoint'?'checkpoint':'transport';
    interrupted={id:current,turn,kind};
    console.error('Evaluation stopped during '+current+' turn '+turn+': '+kind+'. '+(kind==='checkpoint'?'The output checkpoint could not be saved.':'Earlier checkpoints are preserved.'));
  }
  const {structuralPass,semanticReview,totals}=report();
  console.log(JSON.stringify({type:'summary',label,structuralPass,semanticReview,totals,...(stopped?{stopped}:{}),...(interrupted?{error:interrupted}:{})}));
  if(!structuralPass)process.exitCode=1;
}

try{await evaluate();}
catch(error){console.error('Evaluation could not start: '+error.message);process.exitCode=1;}

