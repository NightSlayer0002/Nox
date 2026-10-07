// Full answers stay in text/history. Voice reads a concise opening to bound
// speech latency and free-tier usage independently from reasoning depth.
export function spokenPreview(value,limit=420){
  const text=String(value||'').replace(/\s+/g,' ').trim();
  if(text.length<=limit)return text;
  const opening=text.slice(0,limit),ends=[...opening.matchAll(/[.!?](?:\s|$)/g)];
  const end=ends.at(-1)?.index;
  if(end>limit*.25)return opening.slice(0,end+1);
  return opening.slice(0,Math.max(1,opening.lastIndexOf(' '))).trimEnd()+ '…';
}
