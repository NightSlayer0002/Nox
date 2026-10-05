import { cleanText, MODES } from '../../shared/character.js';

const KEY='nox.chats.v1',queues=new WeakMap();
const newThread=()=>({id:crypto.randomUUID(),title:'New conversation',updated:Date.now(),mode:'companion',turns:[],summary:'',summaryThrough:0,next:1});
async function serialize(storage,action){
  if(globalThis.navigator?.locks?.request)return navigator.locks.request('nox.chat-history.write',action);
  const previous=queues.get(storage)||Promise.resolve(),next=previous.catch(()=>{}).then(action);queues.set(storage,next);
  try{return await next;}finally{if(queues.get(storage)===next)queues.delete(storage);}
}
function parseState(raw){
  const saved=JSON.parse(raw||'null');if(saved?.version!==1||!Array.isArray(saved.threads))return null;
  const seen=new Set();
  const threads=saved.threads.slice(-40).filter(t=>t&&typeof t.id==='string'&&!seen.has(t.id)&&seen.add(t.id)).map(t=>({
    id:cleanText(t.id,60),title:cleanText(t.title,60)||'Conversation',updated:Number(t.updated)||0,mode:MODES.includes(t.mode)?t.mode:'companion',
    summary:cleanText(t.summary,1200),summaryThrough:Math.max(0,Number(t.summaryThrough)||0),
    turns:(Array.isArray(t.turns)?t.turns:[]).filter(v=>v&&['user','assistant'].includes(v.role)&&typeof v.content==='string').slice(-200).map((v,i)=>({role:v.role,content:cleanText(v.content,1200),seq:Number(v.seq)||i+1})),
  }));
  threads.forEach(t=>{t.next=Math.max(t.summaryThrough,...t.turns.map(v=>v.seq),0)+1;});
  return {version:1,active:cleanText(saved.active,60),threads};
}
export async function createHistory(storage,legacy=[]){
  let state={version:1,active:'',threads:[]},currentId='',persistent=true;const listeners=new Set();
  const active=()=>state.threads.find(t=>t.id===currentId);
  function load(){try{const fresh=parseState(storage.getItem(KEY));if(fresh)state=fresh;}catch{persistent=false;}}
  function save(){state.active=currentId;try{storage.setItem(KEY,JSON.stringify(state));persistent=true;}catch{persistent=false;}}
  function choose(){if(!active()){if(!state.threads.length)state.threads.push(newThread());currentId=state.threads[0].id;}}
  await serialize(storage,()=>{load();currentId=state.threads.some(t=>t.id===state.active)?state.active:state.threads[0]?.id||'';
    if(!state.threads.length){const t=newThread();state.threads.push(t);currentId=t.id;for(const turn of legacy.slice(-24))if(['user','assistant'].includes(turn.role))t.turns.push({role:turn.role,content:cleanText(turn.content,1200),seq:t.next++});if(t.turns.length)t.title=cleanText(t.turns.find(v=>v.role==='user')?.content,60)||'Earlier conversation';save();}
  });
  const write=action=>serialize(storage,()=>{if(persistent)load();const result=action();choose();save();return result;});
  async function refresh(){return serialize(storage,()=>{const before=JSON.stringify(active()),id=currentId;if(persistent)load();choose();const currentChanged=id!==currentId||before!==JSON.stringify(active());listeners.forEach(fn=>fn({currentChanged}));});}
  globalThis.window?.addEventListener('storage',event=>{if(event.key===KEY&&(!event.storageArea||event.storageArea===storage))void refresh();});
  return {
    get persistent(){return persistent;},
    get crossTabSafe(){return !globalThis.window||Boolean(globalThis.navigator?.locks?.request);},
    subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
    refresh,
    active:()=>structuredClone(active()),
    list(query=''){const q=query.toLowerCase().trim();return structuredClone(state.threads.filter(t=>!q||`${t.title} ${t.turns.map(v=>v.content).join(' ')}`.toLowerCase().includes(q)).sort((a,b)=>b.updated-a.updated));},
    create(){return write(()=>{if(active()&&!active().turns.length)return structuredClone(active());const t=newThread();state.threads.push(t);state.threads=state.threads.sort((a,b)=>a.updated-b.updated).slice(-40);currentId=t.id;return structuredClone(t);});},
    select(id){return write(()=>{if(!state.threads.some(t=>t.id===id))return false;currentId=id;return true;});},
    setMode(mode){const id=currentId;return write(()=>{const t=state.threads.find(t=>t.id===id);if(!t)return false;t.mode=MODES.includes(mode)?mode:'companion';return true;});},
    append(role,content){const id=currentId,text=cleanText(content,1200);return write(()=>{if(!['user','assistant'].includes(role)||!text)return false;const t=state.threads.find(t=>t.id===id);if(!t)return false;t.turns.push({role,content:text,seq:t.next++});t.turns=t.turns.slice(-200);t.updated=Date.now();if(role==='user'&&t.title==='New conversation')t.title=cleanText(text,60);return true;});},
    remove(id){return write(()=>{state.threads=state.threads.filter(t=>t.id!==id);});},
    context(){const t=active(),pending=t.turns.filter(v=>v.seq>t.summaryThrough);if(pending.length<=12)return {summary:t.summary,history:pending.map(({role,content})=>({role,content}))};
      const recent=t.turns.slice(-8),older=pending.filter(v=>v.seq<recent[0].seq);const excerpts=older.length<=10?older:[...older.slice(0,6),...older.slice(-4)];
      return {summary:t.summary,bridge:cleanText(excerpts.map(v=>`${v.role}: ${cleanText(v.content,130)}`).join(' | '),1600),history:recent.map(({role,content})=>({role,content}))};
    },
    summaryWork(){const t=active(),older=t.turns.slice(0,-8).filter(v=>v.seq>t.summaryThrough);if(older.length<12)return null;const turns=older.slice(0,24).map(v=>({...v,content:cleanText(v.content,600)}));while(new TextEncoder().encode(JSON.stringify({previous:t.summary,turns})).byteLength>12000&&turns.length>1)turns.pop();return {id:t.id,through:turns.at(-1).seq,previous:t.summary,turns:turns.map(({role,content})=>({role,content}))};},
    applySummary(id,through,text){return write(()=>{const t=state.threads.find(t=>t.id===id);if(!t||through<=t.summaryThrough||!t.turns.some(v=>v.seq===through)||typeof text!=='string'||!text.trim())return false;t.summary=cleanText(text,1200);t.summaryThrough=through;return true;});},
    export:()=>JSON.stringify({version:1,exportedAt:new Date().toISOString(),threads:state.threads},null,2),
  };
}
