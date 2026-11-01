// Offline only: prepare saved rollouts for a person. Never assigns a quality
// score, calls a model, or marks a run as semantically reviewed.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {randomInt,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

function options(args){
  const values={};
  for(let index=0;index<args.length;index+=2){
    const flag=args[index],value=args[index+1];
    if(!['--left','--right','--out'].includes(flag)||Object.hasOwn(values,flag)||!value?.trim()||value.startsWith('--'))throw Error('Supply --left report.json --right report.json --out a-new-directory once each.');
    values[flag]=resolve(value);
  }
  if(Object.keys(values).length!==3)throw Error('Supply --left report.json --right report.json --out a-new-directory.');
  return values;
}

function validate(report){
  if(report?.schemaVersion!==2||!Array.isArray(report.requestedCases)||!report.requestedCases.length||new Set(report.requestedCases).size!==report.requestedCases.length||!Array.isArray(report.results)||!report.results.length||report.results.length!==report.totals?.requested||report.results.some(result=>result.status!==200||!result.request?.message||!result.request.context||typeof result.packet?.speech!=='string'||!result.packet.speech.trim()))throw Error('Comparison requires complete successful responses in both version 2 reports.');
  const grouped=new Map(report.requestedCases.map(id=>[id,report.results.filter(result=>result.id===id)]));
  if([...grouped.values()].some(turns=>!turns.length||turns.some((result,index)=>result.turn!==index+1))||[...grouped.values()].flat().length!==report.results.length)throw Error('Comparison requires complete successful responses with consecutive turn numbers.');
  if(!Array.isArray(report.rubric?.dimensions)||!report.rubric.dimensions.length)throw Error('Both reports must include a review rubric.');
  return grouped;
}

const block=value=>String(value).split('\n').map(line=>'    '+line).join('\n');
const contextWithoutHistory=context=>Object.fromEntries(Object.entries(context).filter(([key])=>key!=='history'));

async function compare(){
  const args=options(process.argv.slice(2)),leftText=await readFile(args['--left'],'utf8'),rightText=await readFile(args['--right'],'utf8');
  const left=JSON.parse(leftText),right=JSON.parse(rightText),leftCases=validate(left),rightCases=validate(right);
  if(!isDeepStrictEqual(left.requestedCases,right.requestedCases)||!isDeepStrictEqual(left.rubric,right.rubric))throw Error('Both reports must use the same cases and rubric.');
  for(const id of left.requestedCases){
    const a=leftCases.get(id),b=rightCases.get(id);
    if(a.length!==b.length||!isDeepStrictEqual(a[0].request.context.history,b[0].request.context.history)||a.some((turn,index)=>turn.request.message!==b[index].request.message||!isDeepStrictEqual(contextWithoutHistory(turn.request.context),contextWithoutHistory(b[index].request.context))))throw Error('Both reports must use the same user turns and starting context.');
  }
  const key={schemaVersion:1,createdAt:new Date().toISOString(),assignments:{},runs:Object.fromEntries([['left',left,leftText],['right',right,rightText]].map(([name,report,raw])=>[name,{path:args['--'+name],sha256:createHash('sha256').update(raw).digest('hex'),label:report.label,policyReference:report.policyReference,observed:report.results.map(result=>({id:result.id,turn:result.turn,...result.observed}))}]))};
  const scores={schemaVersion:1,semanticReview:'unreviewed',reviewer:null,reviewedAt:null,instructions:'A person fills ratings (0, 1, 2, or null for not applicable), preference (A, B, tie, or neither), and turn-specific evidence before recording a human review. Do not infer a semantic pass from packet validity.',rubric:left.rubric,cases:[]};
  const lines=['# Conversation comparison','','Status: unreviewed. This packet has not been evaluated by a human.','','Keep answer-key.json away from the reviewer until scores are recorded. A/B assignment is randomized separately for each case. Review each full conversation: later assistant turns have different generated histories. The wording itself may reveal a model or policy; only run metadata is hidden.','','Record scores and evidence in scores.json. These fictional probes do not establish general reliability, learning outcomes or population preference.','','## Rubric','',left.rubric.instructions||'Score each applicable dimension and cite turn-specific evidence.',''];
  for(const dimension of left.rubric.dimensions)lines.push(`- ${dimension.id}: ${dimension.anchors.map((anchor,index)=>`${index} = ${anchor}`).join(' / ')}`);
  for(const id of left.requestedCases){
    const order=randomInt(2)?['right','left']:['left','right'];key.assignments[id]={A:order[0],B:order[1]};
    const emptyRatings=()=>Object.fromEntries(left.rubric.dimensions.map(dimension=>[dimension.id,null]));
    scores.cases.push({id,preference:null,ratings:{A:emptyRatings(),B:emptyRatings()},evidence:{A:'',B:''}});
    lines.push('','## Case '+id,'','Review focus:',block(leftCases.get(id)[0].assessment?.manualReview||''));
    for(const [index,name] of order.entries()){
      const turns=(name==='left'?leftCases:rightCases).get(id);
      lines.push('','### Variant '+(index?'B':'A'),'','Supplied starting history (not generated or scored):',block(JSON.stringify(turns[0].request.context.history||[],null,2)));
      for(const result of turns){
        lines.push('','Turn '+result.turn+' context:',block(JSON.stringify(contextWithoutHistory(result.request.context),null,2)),'','User:',block(result.request.message),'','NOX:',block(result.packet.speech),'','Packet action: '+result.packet.action);
        if(result.assessment?.manualReview)lines.push('','Turn review focus:',block(result.assessment.manualReview));
      }
    }
  }
  // Require a fresh directory; a repeat cannot overwrite saved human scores.
  const out=args['--out'];await mkdir(dirname(out),{recursive:true});await mkdir(out);
  await writeFile(join(out,'review.md'),lines.join('\n')+'\n',{flag:'wx'});
  await writeFile(join(out,'scores.json'),JSON.stringify(scores,null,2)+'\n',{flag:'wx'});
  await writeFile(join(out,'answer-key.json'),JSON.stringify(key,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({out,cases:left.requestedCases.length,semanticReview:'unreviewed',networkRequests:0}));
}
try{await compare();}
catch(error){console.error('Comparison could not start: '+error.message);process.exitCode=1;}
