import { cleanText, MODES, CHAT_INPUT_CHARACTERS, MAX_PACKET_CHARACTERS } from '../../shared/character.js';
import {messageSources} from './message-sources.js';

const KEY='nox.chats.v1',queues=new WeakMap();
export const HISTORY_LIMITS=Object.freeze({conversations:40,turns:200});
const turnText=(value,role)=>typeof value==='string'?value.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ').trim().slice(0,role==='assistant'?MAX_PACKET_CHARACTERS:CHAT_INPUT_CHARACTERS):'';
const newThread=()=>({id:crypto.randomUUID(),title:'New conversation',updated:Date.now(),mode:'companion',turns:[],summary:'',summaryThrough:0,next:1});
async function serialize(storage,action){
  if(globalThis.navigator?.locks?.request)return navigator.locks.request('nox.chat-history.write',action);
  const previous=queues.get(storage)||Promise.resolve(),next=previous.catch(()=>{}).then(action);queues.set(storage,next);
  try{return await next;}finally{if(queues.get(storage)===next)queues.delete(storage);}
}
function parseState(raw){
  if(raw===null)return {version:1,active:'',threads:[]};
  let saved;try{saved=JSON.parse(raw);}catch{throw Object.assign(Error('Unreadable chat archive'),{reason:'invalid'});}
  if(saved?.version!==1)throw Object.assign(Error('Unsupported chat archive'),{reason:saved&&Object.hasOwn(saved,'version')?'unsupported':'invalid'});
  if(!Array.isArray(saved.threads))throw Object.assign(Error('Invalid chat archive'),{reason:'invalid'});
  const seen=new Set();
  for(const t of saved.threads){
    if(!t||typeof t.id!=='string'||!t.id.trim()||t.id!==cleanText(t.id,60)||seen.has(t.id)||!Array.isArray(t.turns)||t.turns.some(v=>!v||!['user','assistant'].includes(v.role)||typeof v.content!=='string'))throw Object.assign(Error('Invalid chat archive'),{reason:'invalid'});
    seen.add(t.id);
  }
  // Existing archives may exceed today's capacity. Loading never prunes them.
  const threads=saved.threads.map(t=>({
    id:cleanText(t.id,60),title:cleanText(t.title,60)||'Conversation',updated:Number(t.updated)||0,mode:MODES.includes(t.mode)?t.mode:'companion',
    summary:cleanText(t.summary,1200),summaryThrough:Math.max(0,Number(t.summaryThrough)||0),
    turns:t.turns.map((v,i)=>({role:v.role,content:v.content,seq:Number(v.seq)||i+1,...sourceMetadata(v.role,v.sources)})),
  }));
  threads.forEach(t=>{t.next=Math.max(t.summaryThrough,...t.turns.map(v=>v.seq),0)+1;});
  return {version:1,active:cleanText(saved.active,60),threads};
}
function sourceMetadata(role,value){const sources=role==='assistant'?messageSources(value):[];return sources.length?{sources}:{};}
export async function createHistory(storage,legacy=[]){
  let state={version:1,active:'',threads:[]},currentId='',persistent=true,recovery=null,lastError='';const listeners=new Set();
  const active=()=>state.threads.find(t=>t.id===currentId);
  function load(){
    let raw;try{raw=storage.getItem(KEY);}catch{persistent=false;lastError='storage-unavailable';return;}
    try{state=parseState(raw);}catch(error){persistent=false;recovery={reason:error.reason||'invalid',raw};lastError='archive-protected';}
  }
  function save(){
    state.active=currentId;if(!persistent||recovery)return;
    try{storage.setItem(KEY,JSON.stringify(state));}catch{persistent=false;lastError='storage-unavailable';}
  }
  function commitCandidate(candidate,error){
    try{storage.setItem(KEY,JSON.stringify(candidate));}catch{lastError=error;return false;}
    state=candidate;currentId=candidate.active;return true;
  }
  function choose(){if(!active()){if(!state.threads.length)state.threads.push(newThread());currentId=state.threads[0].id;}}
  await serialize(storage,()=>{load();currentId=state.threads.some(t=>t.id===state.active)?state.active:state.threads[0]?.id||'';
    if(!state.threads.length){const t=newThread();state.threads.push(t);currentId=t.id;for(const turn of legacy.slice(-24))if(['user','assistant'].includes(turn.role))t.turns.push({role:turn.role,content:cleanText(turn.content,1200),seq:t.next++});if(t.turns.length)t.title=cleanText(t.turns.find(v=>v.role==='user')?.content,60)||'Earlier conversation';save();}
  });
  const write=action=>serialize(storage,()=>{
    const before=JSON.stringify({persistent,recovery:recovery?.reason,lastError});lastError='';
    if(persistent)load();const result=action();choose();if(result!==false&&result!==null)save();
    if(before!==JSON.stringify({persistent,recovery:recovery?.reason,lastError}))listeners.forEach(fn=>fn({currentChanged:false}));
    return result;
  });
  function replaceFrom(seq,content){
    const id=currentId,text=turnText(content,'user');if(!Number.isSafeInteger(seq)||!text||typeof content!=='string'||content.length>CHAT_INPUT_CHARACTERS)return Promise.resolve(null);
    return serialize(storage,()=>{
      lastError='';if(persistent)load();choose();
      if(!persistent||recovery){lastError='transcript-not-saved';return null;}
      const candidate=structuredClone(state),t=candidate.threads.find(thread=>thread.id===id),index=t?.turns.findIndex(turn=>turn.seq===seq&&turn.role==='user');
      if(!t||index<0)return null;
      t.turns=t.turns.slice(0,index+1);t.turns[index].content=text;t.next=seq+1;t.summary='';t.summaryThrough=0;t.updated=Date.now();
      if(index===0)t.title=cleanText(text,60);candidate.active=currentId;
      return commitCandidate(candidate,'transcript-not-saved')?{draft:text,seq,thread:structuredClone(t)}:null;
    });
  }
  async function refresh(){return serialize(storage,()=>{const before=JSON.stringify(active()),id=currentId;if(persistent)load();choose();const currentChanged=id!==currentId||before!==JSON.stringify(active());listeners.forEach(fn=>fn({currentChanged}));});}
  const storageChanged=event=>{if((event.key===KEY||event.key===null)&&(!event.storageArea||event.storageArea===storage))void refresh();};
  globalThis.window?.addEventListener('storage',storageChanged);
  return {
    get persistent(){return persistent&&storage.temporary!==true;},
    get recovery(){return recovery?{reason:recovery.reason}:null;},
    get lastError(){return lastError;},
    get capacity(){return {...HISTORY_LIMITS,conversationCount:state.threads.length,turnCount:active()?.turns.length||0};},
    exportOriginal:()=>recovery?.raw??null,
    resetArchive(){return serialize(storage,()=>{
      if(!recovery)return false;
      let raw;try{raw=storage.getItem(KEY);}catch{lastError='storage-unavailable';return false;}
      if(raw!==recovery.raw){
        try{recovery={reason:'changed',raw,recovered:parseState(raw)};}
        catch(error){recovery={reason:error.reason||'invalid',raw};}
        lastError='archive-changed';return false;
      }
      // Explicit replacement keeps any work composed in the temporary visit.
      const fresh=structuredClone({...state,active:currentId});
      if(recovery.recovered){
        const recovered=structuredClone(recovery.recovered),ids=new Set(recovered.threads.map(t=>t.id));
        for(const thread of fresh.threads){
          if(ids.has(thread.id)){const previous=thread.id;thread.id=crypto.randomUUID();if(fresh.active===previous)fresh.active=thread.id;}
          ids.add(thread.id);recovered.threads.push(thread);
        }
        fresh.threads=recovered.threads;
      }
      try{storage.setItem(KEY,JSON.stringify(fresh));}catch{lastError='storage-unavailable';return false;}
      state=fresh;currentId=fresh.active;persistent=true;recovery=null;lastError='';listeners.forEach(fn=>fn({currentChanged:true}));return true;
    });},
    dispose(){globalThis.window?.removeEventListener('storage',storageChanged);listeners.clear();},
    get crossTabSafe(){return !globalThis.window||Boolean(globalThis.navigator?.locks?.request);},
    subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
    refresh,
    replaceFrom,
    retryFrom(seq){const turns=active()?.turns??[],index=turns.findIndex(turn=>turn.seq===seq);if(index<0)return Promise.resolve(null);const user=turns.slice(0,index+1).findLast(turn=>turn.role==='user');return user?replaceFrom(user.seq,user.content):Promise.resolve(null);},
    active:()=>structuredClone(active()),
    list(query=''){const q=query.toLowerCase().trim();return structuredClone(state.threads.filter(t=>!q||`${t.title} ${t.turns.map(v=>v.content).join(' ')}`.toLowerCase().includes(q)).sort((a,b)=>b.updated-a.updated));},
    create(){return write(()=>{if(active()&&!active().turns.length)return structuredClone(active());if(state.threads.length>=HISTORY_LIMITS.conversations){lastError='conversation-limit';return null;}const t=newThread();state.threads.push(t);currentId=t.id;return structuredClone(t);});},
    select(id){return write(()=>{if(!state.threads.some(t=>t.id===id))return false;currentId=id;return true;});},
    setMode(mode){const id=currentId;return write(()=>{const t=state.threads.find(t=>t.id===id);if(!t)return false;t.mode=MODES.includes(mode)?mode:'companion';return true;});},
    append(role,content,{sources}={}){const id=currentId,text=turnText(content,role),metadata=sourceMetadata(role,sources);return write(()=>{if(!['user','assistant'].includes(role)||!text)return false;const t=state.threads.find(t=>t.id===id);if(!t)return false;if(t.turns.length>=HISTORY_LIMITS.turns-(role==='user'?1:0)){lastError='turn-limit';return false;}t.turns.push({role,content:text,seq:t.next++,...metadata});t.updated=Date.now();if(role==='user'&&t.title==='New conversation')t.title=cleanText(text,60);return true;});},
    remove(id){return serialize(storage,()=>{
      lastError='';if(persistent)load();choose();
      const failed=()=>{lastError='delete-not-saved';return false;};
      if(!persistent||recovery)return failed();
      if(!state.threads.some(thread=>thread.id===id))return false;
      // Deletion is destructive: commit a separate candidate before changing
      // the usable visit. Unlike new replies, failed deletions never fall back
      // to an in-memory success that would return from disk after a reload.
      const candidate=structuredClone(state);candidate.threads=candidate.threads.filter(thread=>thread.id!==id);
      if(!candidate.threads.length)candidate.threads.push(newThread());
      candidate.active=candidate.threads.some(thread=>thread.id===currentId)?currentId:candidate.threads[0].id;
      return commitCandidate(candidate,'delete-not-saved');
    });},
    context(){const t=active(),pending=t.turns.filter(v=>v.seq>t.summaryThrough),opening=t.turns.find(v=>v.seq===1&&v.role==='user');
      const dialogue=turns=>(opening&&!turns.includes(opening)?[opening,...turns]:turns).map(({role,content})=>({role,content}));
      if(pending.length<=12)return {summary:t.summary,history:dialogue(pending)};
      const recent=t.turns.slice(-8),older=pending.filter(v=>v.seq<recent[0].seq);const excerpts=older.length<=10?older:[...older.slice(0,6),...older.slice(-4)];
      return {summary:t.summary,bridge:cleanText(excerpts.map(v=>`${v.role}: ${cleanText(v.content,130)}`).join(' | '),1600),history:dialogue(recent)};
    },
    summaryWork(){const t=active(),older=t.turns.slice(0,-8).filter(v=>v.seq>t.summaryThrough);if(older.length<12)return null;const turns=older.slice(0,24).map(v=>({...v,content:cleanText(v.content,600)}));while(new TextEncoder().encode(JSON.stringify({previous:t.summary,turns})).byteLength>12000&&turns.length>1)turns.pop();return {id:t.id,through:turns.at(-1).seq,previous:t.summary,turns:turns.map(({role,content})=>({role,content}))};},
    applySummary(id,through,text){return write(()=>{const t=state.threads.find(t=>t.id===id);if(!t||through<=t.summaryThrough||!t.turns.some(v=>v.seq===through)||typeof text!=='string'||!text.trim())return false;t.summary=cleanText(text,1200);t.summaryThrough=through;return true;});},
    export:()=>JSON.stringify({version:1,exportedAt:new Date().toISOString(),threads:state.threads},null,2),
  };
}
