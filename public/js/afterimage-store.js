import { normalizeAfterimage } from '../../shared/afterimage.js';
import { cleanText } from '../../shared/character.js';
import { buildSelectedPerformance, normalizeEditedLines } from './afterimage-engine.js';
import {createStorageTransaction} from './storage-transaction.js';
import {createTransactionalArchive} from './transactional-archive.js';

export const AFTERIMAGE_STORAGE_KEY = 'nox.afterimage.v1';
const VERSION = 1, LIMIT = 12;
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

export function sanitizeAfterimageMetrics(value) {
  if (!value || typeof value !== 'object') return undefined;
  return {provider:cleanText(value.provider,20),model:cleanText(value.model,100),totalMs:Number.isFinite(value.totalMs) && value.totalMs >= 0 ? Math.min(Math.round(value.totalMs),3600000) : 0,cacheHit:value.cacheHit === true,...([1,2].includes(value.attempts)?{attempts:value.attempts}:{})};
}

function normalizeReception(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id || value.id.length > 100 || cleanText(value.id,100)!==value.id || !['live','authored'].includes(value.source) || !['wonder','uncanny','bold'].includes(value.tone) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new TypeError('This reception is invalid.');
  const packet = normalizeAfterimage(value.packet),signalIndex=value.signalIndex ?? 0,endingIndex=value.endingIndex ?? 0;
  const editedLines = value.editedLines === undefined ? undefined : normalizeEditedLines(value.editedLines);
  buildSelectedPerformance(packet,signalIndex,endingIndex,editedLines);
  const metrics = sanitizeAfterimageMetrics(value.metrics);
  const revision=value.revision===undefined?0:value.revision;
  if(!Number.isSafeInteger(revision)||revision<0)throw new TypeError('This reception revision is invalid.');
  return freeze({id:cleanText(value.id,100),revision,createdAt:new Date(value.createdAt).toISOString(),packet,seed:cleanText(value.seed,600),tone:value.tone,source:value.source,signalIndex,endingIndex,...(editedLines ? {editedLines} : {}),...(metrics ? {metrics} : {})});
}

function parseStore(raw) {
  if (raw===null||raw===undefined) return [];
    const parsed=JSON.parse(raw);
    if (parsed?.version !== VERSION) throw Error(parsed&&Object.hasOwn(parsed,'version')?'unsupported':'invalid');
    if(!Array.isArray(parsed.receptions))throw Error('invalid');
    const ids=new Set(),receptions=[];
    for (const value of parsed.receptions) {
      const entry=normalizeReception(value);if(ids.has(entry.id))throw Error('invalid');
      ids.add(entry.id);receptions.push(entry);
    }
    return receptions;
}

// Local and deliberately bounded. Refresh and commit share an origin-wide lock.
export function createAfterimageStore(storage, {now = () => Date.now(), createId = () => globalThis.crypto?.randomUUID?.() ?? `take-${Date.now()}-${Math.random().toString(36).slice(2)}`,...options} = {}) {
  let persistent=true,memoryOnly=false,recovery=null,lastRaw,receptions=[],durableIds=new Set(),authority;
  const listeners=new Set();
  if (storage === undefined) { try { storage=globalThis.localStorage; } catch { persistent=false; } }
  if (!storage?.getItem || !storage?.setItem) {persistent=false;memoryOnly=true;}
  const transaction=createStorageTransaction(storage,'nox.afterimage.write',options);
  let state;
  function refresh() {
    if (memoryOnly) return;
    try {
      if(authority&&!authority.loaded)return;
      const raw=authority?authority.raw:storage.getItem(AFTERIMAGE_STORAGE_KEY);if(raw===lastRaw)return;
      if(recovery)recovery={reason:'changed',raw};
      else try{receptions=parseStore(raw);durableIds=new Set(receptions.map(item=>item.id));persistent=true;}catch(error){receptions=[];recovery={reason:error.message==='unsupported'?'unsupported':'invalid',raw};persistent=false;}
      lastRaw=raw;
    } catch { persistent=false;memoryOnly=true; }
  }
  function publish() {
    state=freeze({version:VERSION,persistent:persistent&&storage?.temporary!==true,recovery:recovery?{reason:recovery.reason}:null,receptions:[...receptions]});
    for (const listener of listeners) { try { listener(state); } catch {} }
  }
  function persist(next) {
    if (!memoryOnly&&!recovery) { try { const raw=JSON.stringify({version:VERSION,receptions:next});storage.setItem(AFTERIMAGE_STORAGE_KEY,raw);lastRaw=raw;durableIds=new Set(next.map(item=>item.id));persistent=true; } catch { persistent=false;publish();throw Error('Could not save changes to your story archive. Browser storage may be full or blocked. The saved stories are unchanged. Export a copy and retry.'); } }
    receptions=next;
    publish();
  }
  const mutate=operation=>memoryOnly||recovery?operation():transaction.run(operation);
  refresh();publish();
  const api={
    get persistent() { return persistent&&storage?.temporary!==true&&(!authority||authority.loaded&&!authority.error); },
    get error(){return authority?.error||'';},
    get legacyBackup(){return authority?.legacyBackup||false;},
    get crossTabSafe() { return memoryOnly||(authority?authority.supported:transaction.supported); },
    get recovery() { refresh();return recovery?{reason:recovery.reason}:authority?.error?{reason:'changed'}:null; },
    exportOriginal() { refresh();return recovery?.raw??authority?.legacyRaw??null; },
    discardLegacy(expected){return authority?authority.acknowledgeLegacy(expected):Promise.resolve(false);},
    resetOriginal(expected) {return transaction.run(()=>{
      if(!recovery||expected!==recovery.raw)return false;
      let raw;try{raw=storage.getItem(AFTERIMAGE_STORAGE_KEY);}catch{return false;}
      if(raw!==expected){recovery={reason:'changed',raw};lastRaw=raw;publish();return false;}
      let candidate=receptions,original;
      try{original=parseStore(raw);}catch{}
      if(original){
        candidate=[...original];const ids=new Set(candidate.map(item=>item.id));
        for(const item of receptions){
          const same=candidate.find(saved=>saved.id===item.id);
          if(same&&JSON.stringify(same)===JSON.stringify(item))continue;
          let id=item.id;while(ids.has(id))id=globalThis.crypto?.randomUUID?.()||`take-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          ids.add(id);candidate.push(id===item.id?item:normalizeReception({...item,id}));
        }
      }
      try{const encoded=JSON.stringify({version:VERSION,receptions:candidate});storage.setItem(AFTERIMAGE_STORAGE_KEY,encoded);lastRaw=encoded;}catch{persistent=false;publish();return false;}
      receptions=candidate;durableIds=new Set(candidate.map(item=>item.id));recovery=null;persistent=true;publish();return true;
    });},
    snapshot:() => state,
    subscribe(listener) { listeners.add(listener);return () => listeners.delete(listener); },
    list:() => {refresh();return [...receptions];},
    get:id => {refresh();return receptions.find(entry => entry.id === id) ?? null;},
    add(value,{signal}={}) {return mutate(()=>{
      signal?.throwIfAborted();
      const entry=normalizeReception({...value,id:createId(),createdAt:new Date(now()).toISOString(),signalIndex:value?.signalIndex ?? 0,endingIndex:value?.endingIndex ?? 0});
      refresh();if(receptions.length>=LIMIT)throw Error('Your story archive is full (12 stories). Export a copy and delete a story before adding another. Nothing was removed.');
      persist([entry,...receptions.filter(item => item.id !== entry.id)]);return entry;
    });},
    update(id,patch = {},{expectedRevision} = {}) {return mutate(()=>{
      refresh();const index=receptions.findIndex(entry => entry.id === id);
      if (index < 0) { publish();return null; }
      const previous=receptions[index],signalIndex=patch.signalIndex ?? previous.signalIndex,endingIndex=patch.endingIndex ?? previous.endingIndex;
      // Compare after the fresh read, inside the same cross-tab write lock.
      if(expectedRevision!==undefined&&expectedRevision!==previous.revision)throw Object.assign(Error('This story changed in another tab. Your edits are still here. Review the saved cut before applying them.'),{code:'story_conflict'});
      const branchChanged=signalIndex !== previous.signalIndex || endingIndex !== previous.endingIndex;
      const editedLines=Object.hasOwn(patch,'editedLines') ? patch.editedLines : branchChanged ? undefined : previous.editedLines;
      const entry=normalizeReception({...previous,revision:previous.revision+1,signalIndex,endingIndex,editedLines});
      persist(receptions.map((item,i) => i === index ? entry : item));return entry;
    });},
    remove(id) {
      const failed=error=>({removed:false,committed:false,scope:storage?.temporary!==true&&durableIds.has(id)?'browser':storage?.temporary===true||memoryOnly||recovery?'visit':'browser',error:error.message||'The saved story could not be deleted.'});
      try{const result=mutate(()=>{
        refresh();const scope=storage?.temporary===true||memoryOnly||recovery?'visit':'browser';
        if(memoryOnly&&storage?.temporary!==true&&durableIds.has(id))throw Error('Could not delete the saved story because browser storage cannot be read. It is still listed. Export a copy and reload before retrying.');
        if(!receptions.some(entry=>entry.id===id))return {removed:false,committed:false,scope};
        persist(receptions.filter(entry=>entry.id!==id));return {removed:true,committed:true,scope};
      });return typeof result?.then==='function'?result.catch(failed):result;}catch(error){return failed(error);}
    },
    clear() { return mutate(()=>{refresh();if(memoryOnly&&storage?.temporary!==true&&durableIds.size)throw Error('Could not clear saved stories because browser storage cannot be read. Export a copy and reload before retrying.');persist([]);}); },
    export(id) { refresh();const entry=id === undefined ? {version:VERSION,receptions} : receptions.find(item => item.id === id);if (!entry) throw new Error('This reception was deleted.');return JSON.stringify(entry,null,2); },
  };
  authority=memoryOnly?null:createTransactionalArchive(storage,AFTERIMAGE_STORAGE_KEY,{...options,lockName:'nox.afterimage.write',validate:parseStore});
  if(!authority){api.ready=Promise.resolve(true);api.refresh=async()=>{refresh();publish();return true;};return api;}
  authority.subscribe(({error})=>{refresh();persistent=!error&&!recovery;publish();});
  api.ready=authority.ready.then(()=>{refresh();publish();return true;},()=>{refresh();persistent=false;publish();return authority.protectedOriginal;});
  api.refresh=async()=>{try{await authority.refresh();refresh();publish();return true;}catch{return authority.protectedOriginal;}};
  for(const name of ['add','update','remove','clear']){
    const original=api[name];
    api[name]=(...args)=>{
      if(memoryOnly||recovery)return original(...args);
      const signal=name==='add'?args[1]?.signal:undefined;
      const change=authority.run(raw=>{
        let bytes=raw;
        const staged={getItem:()=>bytes,setItem:(_,value)=>{bytes=String(value);}};
        const draft=createAfterimageStore(staged,{now,createId,browser:false});
        if(draft.recovery)throw Error('Your saved story archive needs recovery. Export the protected original before retrying.');
        const result=draft[name](...args);
        return {raw:bytes,result};
      },{signal});
      return name==='remove'?change.catch(error=>({removed:false,committed:false,scope:'browser',error:error.message})):change;
    };
  }
  const reset=api.resetOriginal;
  api.resetOriginal=async expected=>{
    if(authority.loaded&&authority.error&&!recovery)return authority.acknowledgeLegacy(expected);
    if(authority.loaded&&recovery){
      try{
        const result=await authority.run(raw=>({raw:raw===expected?JSON.stringify({version:VERSION,receptions}):raw,result:raw===expected}));
        if(result){recovery=null;lastRaw=undefined;refresh();publish();}return result;
      }catch{return false;}
    }
    const result=await reset(expected);return result?api.refresh():false;
  };
  return api;
}
