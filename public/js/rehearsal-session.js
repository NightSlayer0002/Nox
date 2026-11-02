import {REHEARSAL_LIMITS} from '../../shared/rehearsal.js';
import {parseNarration} from './rehearsal-narration.js';
// Visit-only source ownership. A model answer never advances the cursor or
// certifies understanding. Only the user can mark a section self-checked.
export function createRehearsalSession(){
  const files=new Map(),records=[];
  let active='',serial=0,epoch=0,goal='Explain this project in an interview.',corrections=[];
  const current=()=>files.get(active);
  function open(source){
    if(typeof source?.text!=='string'||!source.text.trim())throw Error('Add some code first.');
    const text=source.text.replace(/\r\n?/g,'\n'),lines=text.split('\n');
    if(new TextEncoder().encode(text).length>65536||lines.length>2000)throw Error('This file is too large. Choose a file under 64 KB and 2,000 lines.');
    if(!source.path||source.path.length>240)throw Error('Use a short file name.');
    const existing=[...files.values()].find(file=>file.path===source.path&&file.revision===source.revision&&file.text===text);
    if(existing){active=existing.id;epoch++;return snapshot();}
    if(files.size>=12)throw Error('This visit already has 12 files. Export your preparation sheet before starting another conversation.');
    const file={...source,text,lines,id:`source-${++serial}`,start:1,discussed:new Set(),ready:new Set()};
    files.set(file.id,file);active=file.id;epoch++;return snapshot();
  }
  function switchFile(id){if(!files.has(id))return false;active=id;epoch++;return true;}
  function range(){
    const file=current();if(!file)return null;
    let end=file.end??Math.min(file.start+7,file.lines.length),code=file.lines.slice(file.start-1,end).join('\n');
    while(code.length>6000&&end>file.start){end--;code=file.lines.slice(file.start-1,end).join('\n');}
    return {startLine:file.start,endLine:end,code,totalLines:file.lines.length};
  }
  function select(line){const file=current();if(!file||!Number.isInteger(line)||line<1||line>file.lines.length)return false;file.start=line;file.end=null;epoch++;return true;}
  function selectRange(start,end){
    const file=current();if(!file||![start,end].every(Number.isInteger)||start<1||end<start||end>file.lines.length)throw Error('Choose valid start and end line numbers.');
    if(end-start+1>REHEARSAL_LIMITS.lines||file.lines.slice(start-1,end).join('\n').length>REHEARSAL_LIMITS.characters)throw Error('Choose a complete section within 80 lines and 6,000 characters. Add dependencies as another section when needed.');
    file.start=start;file.end=end;epoch++;return true;
  }
  function next(){const file=current(),section=range();return Boolean(file&&section.endLine<file.lines.length&&select(section.endLine+1));}
  function previous(){const file=current();return Boolean(file&&file.start>1&&select(Math.max(1,file.start-8)));}
  function context(intent='discuss'){
    const file=current(),section=range();if(!file)return null;
    if(section.code.length>6000)throw Error('This line is too long to discuss intact. Paste a smaller, complete excerpt. Nothing has been sent.');
    return {version:1,path:file.path,revision:file.revision||'pasted',source:file.source||'pasted',...section,goal,corrections:[...corrections],intent};
  }
  function capture(intent='discuss'){
    if(records.length>=80)throw Error('This preparation sheet has 80 replies. Export it before starting a new conversation.');
    const data=context(intent);return data?Object.freeze({file:active,epoch,context:data}):null;
  }
  function recall(ticket){
    if(!ticket||!files.has(ticket.file))throw Error('Reopen the original source before retrying this explanation.');
    switchFile(ticket.file);selectRange(ticket.context.startLine,ticket.context.endLine);return capture(ticket.context.intent);
  }
  function complete(ticket,answer,input=''){
    if(!ticket||ticket.file!==active||ticket.epoch!==epoch||typeof answer!=='string'||!answer.trim())return false;
    // Tickets are immutable; keep consumption separate from caller-owned data.
    if(consumed.has(ticket))return false;consumed.add(ticket);
    const file=current(),{startLine,endLine,intent}=ticket.context;
    let explained=intent==='explain';
    if(intent==='narrate'){
      // Reuse playback's alignment gate; preserve malformed written answers without claiming coverage.
      try{parseNarration(answer,ticket.context);explained=true;}catch{}
    }
    if(explained)for(let line=startLine;line<=endLine;line++)file.discussed.add(line);
    records.push({file:file.id,context:structuredClone(ticket.context),input,answer});return true;
  }
  const consumed=new WeakSet();
  function markReady(value){const file=current(),section=range();if(!file)return;for(let n=section.startLine;n<=section.endLine;n++)value?file.ready.add(n):file.ready.delete(n);}
  function setGoal(value){if(typeof value!=='string'||value.length>300)throw Error('Keep the interview goal within 300 characters.');goal=value.trim();epoch++;}
  function setCorrections(value){
    const next=String(value).split('\n').map(line=>line.trim()).filter(Boolean);
    if(next.length>6||next.some(line=>line.length>240))throw Error('Keep up to six corrections, each within 240 characters.');
    corrections=next;epoch++;
  }
  function snapshot(){
    const file=current(),section=range();
    return {file:file?{id:file.id,path:file.path,text:file.text,lines:[...file.lines],revision:file.revision,source:file.source,url:file.url}:null,
      files:[...files.values()].map(f=>({id:f.id,path:f.path})),section,goal,corrections:[...corrections],discussed:file?.discussed.size||0,ready:file?.ready.size||0,
      sectionReady:Boolean(file&&Array.from({length:section.endLine-section.startLine+1},(_,i)=>section.startLine+i).every(n=>file.ready.has(n))),records:structuredClone(records)};
  }
  function exportSheet(){
    const out=['NOX — code interview preparation','This is a preparation record, not a certification of correctness or understanding.','','Opened sources and current self-checks:'];
    for(const file of files.values())out.push(`File: ${file.path}`,`Source: ${file.source} · revision ${file.revision||'pasted'}`,file.url||'',`Discussed: ${file.discussed.size}/${file.lines.length} lines. Self-check: ${file.ready.size}/${file.lines.length} lines.`,'');
    for(const [index,record] of records.entries()){
      const c=record.context;
      out.push(`Discussion ${index+1}`,`${c.path} · lines ${c.startLine}–${c.endLine} · ${c.intent}`,`Source: ${c.source} · revision ${c.revision}`,`Goal at submission: ${c.goal||'(none)'}`,'Corrections at submission:',...(c.corrections.length?c.corrections.map(value=>`- ${value}`):['- None.']),'','Selected source:',c.code,'','Your message:',record.input,'','NOX (AI-generated; verify against your code):',record.answer,'');
    }
    out.push('Current draft for the next message (not applied to earlier replies):',`Goal: ${goal||'(none)'}`,'Corrections to preserve:',...(corrections.length?corrections.map(value=>`- ${value}`):['- None.']),'');
    return out.join('\n');
  }
  return {open,switchFile,select,selectRange,next,previous,context,capture,recall,complete,markReady,setGoal,setCorrections,snapshot,export:exportSheet,isCurrent:ticket=>ticket?.file===active&&ticket.epoch===epoch};
}

export const REHEARSAL_EXAMPLE=Object.freeze({path:'retry.js',source:'example',revision:'example-v1',text:`export async function retry(task, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// Interview prompts: What happens when attempts is zero?
// Would retrying every error be safe for a payment request?
`});
