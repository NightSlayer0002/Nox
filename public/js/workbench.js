import {createKnowledge} from './knowledge.js';
import {visit} from './visit-scope.js';
const storage=visit.storage;
export const knowledge=createKnowledge(storage);
export function readDepth(){if(!visit.owner)return 'quick';try{const value=storage?.getItem('nox.depth.v1');return ['quick','balanced','deep'].includes(value)?value:'balanced';}catch{return 'balanced';}}
export function saveDepth(value){if(!['quick','balanced','deep'].includes(value))return;value=visit.owner?value:'quick';try{storage?.setItem('nox.depth.v1',value);}catch{}window.dispatchEvent(new CustomEvent('nox:depth',{detail:value}));}
export function knowledgeChanged(){window.dispatchEvent(new Event('nox:knowledge'));}
export function downloadText(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
