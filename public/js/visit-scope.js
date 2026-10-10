import {createVisitScope} from './visit-storage.js';
export const guestRequested=globalThis.location?.pathname?.replace(/\/$/,'')==='/guest'||new URLSearchParams(globalThis.location?.search||'').get('guest')==='1';
export function normalizeVisitStatus(status,forceGuest=guestRequested){
  if((forceGuest||!status.owner)&&status.guestProvider)return {...status,owner:false,brain:'live',access:'guest',model:status.guestProvider.model,providers:[status.guestProvider],provider:'groq'};
  return forceGuest?{...status,owner:false,access:'guest',providers:[],provider:null,brain:'demo'}:status;
}
export async function requestVisitStatus({headers={},forceGuest=guestRequested}={}){
  const response=await fetch('/api/status',{headers:{...headers,...(forceGuest?{'x-nox-guest':'1'}:{})},cache:'no-store'});
  if(!response.ok)throw Object.assign(Error('Server status is unavailable.'),{status:response.status});
  return normalizeVisitStatus(await response.json(),forceGuest);
}
let status,storage;
try{status=await requestVisitStatus();}catch{/* Keep private local data closed if access cannot be verified. */}
try{storage=globalThis.localStorage;}catch{/* The visit can stay temporary. */}
export const visit=createVisitScope({owner:status?.owner===true,guest:guestRequested,storage});
export const initialVisitStatus=status;
