import {createVisitScope} from './visit-storage.js';
export const guestRequested=globalThis.location?.pathname?.replace(/\/$/,'')==='/guest'||new URLSearchParams(globalThis.location?.search||'').get('guest')==='1';
export function normalizeVisitStatus(status,forceGuest=guestRequested){
  if((forceGuest||!status.owner)&&status.guestProvider)return {...status,owner:false,brain:'live',access:'guest',model:status.guestProvider.model,providers:[status.guestProvider],provider:'groq'};
  return forceGuest?{...status,owner:false,access:'guest',providers:[],provider:null,brain:'demo'}:status;
}
export async function requestVisitStatus({headers={},forceGuest=guestRequested}={}){
  const controller=new AbortController();let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{
    const error=Object.assign(Error('Checking the AI connection took too long. Try again.'),{name:'TimeoutError'});
    controller.abort(error);reject(error);
  },5000);});
  try{
    const checked=(async()=>{
      const response=await fetch('/api/status',{headers:{...headers,...(forceGuest?{'x-nox-guest':'1'}:{})},cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Object.assign(Error('Server status is unavailable.'),{status:response.status});
      return normalizeVisitStatus(await response.json(),forceGuest);
    })();
    // Bound both receiving headers and reading the body, even if a stalled
    // transport fails to settle its promise when its request is aborted.
    return await Promise.race([checked,deadline]);
  }finally{clearTimeout(timer);}
}
// Guests already have an explicit temporary scope. Share the connection check
// with the app without making local activities or typing wait for its network.
export const initialVisitStatusPromise=requestVisitStatus();
// The app observes this same rejection after its local controls are attached.
// Handle early failures here too, before a slower module graph reaches it.
initialVisitStatusPromise.catch(()=>{});
let status,storage;
if(!guestRequested)try{status=await initialVisitStatusPromise;}catch{/* Keep private local data closed if access cannot be verified. */}
try{if(status?.owner===true&&!guestRequested)storage=globalThis.localStorage;}catch{/* The visit can stay temporary. */}
export const visit=createVisitScope({owner:status?.owner===true,guest:guestRequested,storage});
export const initialVisitStatus=status;
