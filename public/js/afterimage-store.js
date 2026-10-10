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
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id || value.id.length > 100 || !['live','authored'].includes(value.source) || !['wonder','uncanny','bold'].includes(value.tone) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new TypeError('This reception is invalid.');
  const packet = normalizeAfterimage(value.packet),signalIndex=value.signalIndex ?? 0,endingIndex=value.endingIndex ?? 0;
  const editedLines = value.editedLines === undefined ? undefined : normalizeEditedLines(value.editedLines);
  buildSelectedPerformance(packet,signalIndex,endingIndex,editedLines);
  const metrics = sanitizeAfterimageMetrics(value.metrics);
  return freeze({id:cleanText(value.id,100),createdAt:new Date(value.createdAt).toISOString(),packet,seed:cleanText(value.seed,600),tone:value.tone,source:value.source,signalIndex,endingIndex,...(editedLines ? {editedLines} : {}),...(metrics ? {metrics} : {})});
}

function parseStore(raw) {
  if (!raw) return [];
  try {
    const parsed=JSON.parse(raw);
    if (parsed?.version !== VERSION || !Array.isArray(parsed.receptions)) return [];
    const ids=new Set(),receptions=[];
    for (const value of parsed.receptions.slice(0,100)) {
      try { const entry=normalizeReception(value);if (!ids.has(entry.id)) { ids.add(entry.id);receptions.push(entry); } } catch {}
      if (receptions.length === LIMIT) break;
    }
    return receptions;
  } catch { return []; }
}

// Local and deliberately bounded. Refresh before writes so stale tabs cannot revive deleted takes.
export function createAfterimageStore(storage, {now = () => Date.now(), createId = () => globalThis.crypto?.randomUUID?.() ?? `take-${Date.now()}-${Math.random().toString(36).slice(2)}`} = {}) {
  let persistent=storage?.temporary!==true,receptions=[];
  const listeners=new Set();
  if (storage === undefined) { try { storage=globalThis.localStorage; } catch { persistent=false; } }
  if (!storage?.getItem || !storage?.setItem) persistent=false;
  if (persistent) { try { receptions=parseStore(storage.getItem(AFTERIMAGE_STORAGE_KEY)); } catch { persistent=false; } }
  let state=freeze({version:VERSION,persistent,receptions});
  function refresh() {
    if (!persistent) return;
    try { receptions=parseStore(storage.getItem(AFTERIMAGE_STORAGE_KEY)); }
    catch { persistent=false; }
  }
  function publish() {
    state=freeze({version:VERSION,persistent,receptions:[...receptions]});
    for (const listener of listeners) { try { listener(state); } catch {} }
  }
  function persist() {
    if (persistent) { try { storage.setItem(AFTERIMAGE_STORAGE_KEY,JSON.stringify({version:VERSION,receptions})); } catch { persistent=false; } }
    publish();
  }
  return {
    get persistent() { return persistent; },
    snapshot:() => state,
    subscribe(listener) { listeners.add(listener);return () => listeners.delete(listener); },
    list:() => [...receptions],
    get:id => receptions.find(entry => entry.id === id) ?? null,
    add(value) {
      const entry=normalizeReception({...value,id:createId(),createdAt:new Date(now()).toISOString(),signalIndex:value?.signalIndex ?? 0,endingIndex:value?.endingIndex ?? 0});
      refresh(); receptions=[entry,...receptions.filter(item => item.id !== entry.id)].slice(0,LIMIT);persist();return entry;
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
    clear() { receptions=[];persist(); },
    export(id) { const entry=id === undefined ? {version:VERSION,receptions} : receptions.find(item => item.id === id);if (!entry) throw new Error('This reception was deleted.');return JSON.stringify(entry,null,2); },
  };
}
