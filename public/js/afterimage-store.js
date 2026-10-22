import { normalizeAfterimage } from '../../shared/afterimage.js';
import { cleanText } from '../../shared/character.js';
import { buildSelectedPerformance, normalizeEditedLines } from './afterimage-engine.js';

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
  return freeze({id:cleanText(value.id,100),createdAt:new Date(value.createdAt).toISOString(),packet,seed:cleanText(value.seed,600),tone:value.tone,source:value.source,signalIndex,endingIndex,...(editedLines ? {editedLines} : {}),...(metrics ? {metrics} : {})});
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

// Local and deliberately bounded. Refresh before writes so stale tabs cannot revive deleted takes.
export function createAfterimageStore(storage, {now = () => Date.now(), createId = () => globalThis.crypto?.randomUUID?.() ?? `take-${Date.now()}-${Math.random().toString(36).slice(2)}`} = {}) {
  let persistent=true,memoryOnly=false,recovery=null,lastRaw,receptions=[];
  const listeners=new Set();
  if (storage === undefined) { try { storage=globalThis.localStorage; } catch { persistent=false; } }
  if (!storage?.getItem || !storage?.setItem) {persistent=false;memoryOnly=true;}
  let state;
  function refresh() {
    if (memoryOnly) return;
    try {
      const raw=storage.getItem(AFTERIMAGE_STORAGE_KEY);if(raw===lastRaw)return;
      if(recovery)recovery={reason:'changed',raw};
      else try{receptions=parseStore(raw);persistent=true;}catch(error){receptions=[];recovery={reason:error.message==='unsupported'?'unsupported':'invalid',raw};persistent=false;}
      lastRaw=raw;
    } catch { persistent=false;memoryOnly=true; }
  }
  function publish() {
    state=freeze({version:VERSION,persistent:persistent&&storage?.temporary!==true,recovery:recovery?{reason:recovery.reason}:null,receptions:[...receptions]});
    for (const listener of listeners) { try { listener(state); } catch {} }
  }
  function persist() {
    if (!memoryOnly&&!recovery) { try { const raw=JSON.stringify({version:VERSION,receptions});storage.setItem(AFTERIMAGE_STORAGE_KEY,raw);lastRaw=raw;persistent=true; } catch { persistent=false;memoryOnly=true; } }
    publish();
  }
  refresh();publish();
  return {
    get persistent() { return persistent&&storage?.temporary!==true; },
    get recovery() { refresh();return recovery?{reason:recovery.reason}:null; },
    exportOriginal() { refresh();return recovery?.raw??null; },
    resetOriginal(expected) {
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
      receptions=candidate;recovery=null;persistent=true;publish();return true;
    },
    snapshot:() => state,
    subscribe(listener) { listeners.add(listener);return () => listeners.delete(listener); },
    list:() => {refresh();return [...receptions];},
    get:id => {refresh();return receptions.find(entry => entry.id === id) ?? null;},
    add(value) {
      const entry=normalizeReception({...value,id:createId(),createdAt:new Date(now()).toISOString(),signalIndex:value?.signalIndex ?? 0,endingIndex:value?.endingIndex ?? 0});
      refresh();if(receptions.length>=LIMIT)throw Error('Your story archive is full (12 stories). Export a copy and delete a story before adding another. Nothing was removed.');
      receptions=[entry,...receptions.filter(item => item.id !== entry.id)];persist();return entry;
    },
    update(id,patch = {}) {
      refresh();const index=receptions.findIndex(entry => entry.id === id);
      if (index < 0) { publish();return null; }
      const previous=receptions[index],signalIndex=patch.signalIndex ?? previous.signalIndex,endingIndex=patch.endingIndex ?? previous.endingIndex;
      const branchChanged=signalIndex !== previous.signalIndex || endingIndex !== previous.endingIndex;
      const editedLines=Object.hasOwn(patch,'editedLines') ? patch.editedLines : branchChanged ? undefined : previous.editedLines;
      const entry=normalizeReception({...previous,signalIndex,endingIndex,editedLines});
      receptions=receptions.map((item,i) => i === index ? entry : item);persist();return entry;
    },
    remove(id) { refresh();const count=receptions.length;receptions=receptions.filter(entry => entry.id !== id);if (count === receptions.length) { publish();return false; }persist();return true; },
    clear() { refresh();receptions=[];persist(); },
    export(id) { refresh();const entry=id === undefined ? {version:VERSION,receptions} : receptions.find(item => item.id === id);if (!entry) throw new Error('This reception was deleted.');return JSON.stringify(entry,null,2); },
  };
}
