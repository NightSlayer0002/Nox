import {visit} from './visit-scope.js';
import {isDeviceId} from './device-store.js';
import {createAdaptivePreferences} from './adaptive-preferences.js';

// Guest preferences share the same temporary scope as guest chats and notes.
// Private developer preferences retain their existing, separate namespace.
let device=visit.storage;
if(visit.owner){try{const disk=globalThis.localStorage,prefix='nox.owner.release.';device={getItem:key=>disk.getItem(prefix+key),setItem:(key,value)=>disk.setItem(prefix+key,value),removeItem:key=>disk.removeItem(prefix+key)};}catch{}}
export const approvedPreferences=createAdaptivePreferences(device);
export function companionChanged(){globalThis.window?.dispatchEvent(new Event('nox:companion-change'));}
let adapter;
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
export const companionBridge={
  connect(value){adapter=value;companionChanged();return()=>{if(adapter===value)adapter=null;};},
  snapshot(){return adapter?.snapshot?.()||{};},
  async fresh(){return adapter?.fresh?.();},
  async start(text,activity){return adapter?.start?.(text,activity);},
  propose(text,scope){const proposal=approvedPreferences.propose(text,scope);if(proposal)globalThis.window?.dispatchEvent(new CustomEvent('nox:preference-proposal',{detail:proposal}));return proposal;},
  preferenceChanged(){adapter?.preferenceChanged?.();companionChanged();},
};
