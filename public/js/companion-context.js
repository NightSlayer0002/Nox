import {visit} from './visit-scope.js';
import {createContinuity,isDeviceId} from './continuity.js';
import {createAdaptivePreferences} from './adaptive-preferences.js';

// Public device saves never read the developer's private archive or preferences.
const prefix=visit.owner?'nox.owner.release.':'nox.visitor.release.';
let device;
try{const disk=globalThis.localStorage;device={getItem:key=>disk.getItem(prefix+key),setItem:(key,value)=>disk.setItem(prefix+key,value),removeItem:key=>disk.removeItem(prefix+key)};}catch{}
export const savedActivities=createContinuity(device);
export const approvedPreferences=createAdaptivePreferences(device);
export function companionChanged(){globalThis.window?.dispatchEvent(new Event('nox:continuity'));}
let adapter;
const pendingOpens=new Map();
// Only the latest instance of each activity is retained, in this module's memory.
// Leaving an activity is not consent to write it to localStorage.
const visitActivities=new Map(),visitKinds=new Set(['explore','guessing']);
export function rememberActivity(kind,item){
  if(!visitKinds.has(kind)||!isDeviceId(item?.id)||!item?.state||typeof item.state!=='object'||Array.isArray(item.state)||item.state.kind!==kind)return null;
  try{
    const snapshot=structuredClone({id:item.id,kind,state:item.state});visitActivities.set(kind,snapshot);return structuredClone(snapshot);
  }catch{return null;}
}
export function getActivity(kind){const item=visitActivities.get(kind);return item?structuredClone(item):null;}
export function queueSavedOpen(item){pendingOpens.set(item.kind,structuredClone(item));}
export function takeSavedOpen(kind){
  const item=pendingOpens.get(kind);pendingOpens.delete(kind);
  // An explicit saved-open wins over the latest unsaved visit snapshot.
  if(item&&visitKinds.has(kind))rememberActivity(kind,item);
  return item||null;
}
export const companionBridge={
  connect(value){adapter=value;companionChanged();return()=>{if(adapter===value)adapter=null;};},
  snapshot(){return adapter?.snapshot?.()||{};},
  async keep(){return adapter?.keep?.();},
  async open(item){return adapter?.open?.(item);},
  async fresh(){return adapter?.fresh?.();},
  async start(text,activity){return adapter?.start?.(text,activity);},
  propose(text,scope){const proposal=approvedPreferences.propose(text,scope);if(proposal)globalThis.window?.dispatchEvent(new CustomEvent('nox:preference-proposal',{detail:proposal}));return proposal;},
  preferenceChanged(){adapter?.preferenceChanged?.();companionChanged();},
};
