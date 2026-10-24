// Attribution is a snapshot of labels, never a second copy of private notes.
export function messageSources(value){
  if(!Array.isArray(value))return [];
  const seen=new Set(),text=(v,max)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
  const sources=[];
  for(const item of value){
    const id=text(item?.id,60),title=text(item?.title,120);
    if(!id||!title||seen.has(id))continue;
    seen.add(id);sources.push({id,title});if(sources.length===6)break;
  }
  return sources;
}

export function attachMessageSources(message,value,documentTarget=globalThis.document){
  const sources=messageSources(value);if(!sources.length)return;
  const label=documentTarget.createElement('p');label.className='knowledge-sources';
  label.textContent='Context included: '+sources.map(n=>`[${n.id}] ${n.title}`).join(' · ');
  message.append(label);
}
