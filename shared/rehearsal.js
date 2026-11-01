// Source identity and line numbers describe one complete excerpt, never a
// clipped approximation. LF is the common line boundary used by the source UI.
export const REHEARSAL_LIMITS=Object.freeze({lines:80,characters:6000,fileLines:2000,path:240,revision:80,goal:300,corrections:6,correction:240});
const controls=/[\u0000-\u001f\u007f-\u009f]/;
const sourceControls=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const metadata=(value,limit)=>typeof value==='string'&&value.trim().length>0&&value.length<=limit&&!controls.test(value);
const note=(value,limit)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').trim().slice(0,limit):'';

export function sanitizeRehearsal(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  if(value.version!==1||!metadata(value.path,REHEARSAL_LIMITS.path)||!metadata(value.revision,REHEARSAL_LIMITS.revision))return null;
  if(!['github','local','pasted','example'].includes(value.source)||!['explain','question','discuss'].includes(value.intent))return null;
  const {startLine,endLine,totalLines}=value;
  if(![startLine,endLine,totalLines].every(Number.isInteger)||startLine<1||endLine<startLine||endLine>totalLines||totalLines>REHEARSAL_LIMITS.fileLines||endLine-startLine+1>REHEARSAL_LIMITS.lines)return null;
  if(typeof value.code!=='string')return null;
  const code=value.code.replace(/\r\n?/g,'\n');
  if(code.length>REHEARSAL_LIMITS.characters||sourceControls.test(code)||code.split('\n').length!==endLine-startLine+1)return null;
  const corrections=[];
  for(const item of Array.isArray(value.corrections)?value.corrections:[]){
    const correction=note(item,REHEARSAL_LIMITS.correction);
    if(correction)corrections.push(correction);
    if(corrections.length===REHEARSAL_LIMITS.corrections)break;
  }
  return {version:1,path:value.path,revision:value.revision,source:value.source,startLine,endLine,totalLines,code,goal:note(value.goal,REHEARSAL_LIMITS.goal),corrections,intent:value.intent};
}
