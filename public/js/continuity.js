// Device saves are deliberate copies, separate from the owner's chat history.
const KEY='nox.device-library.v1',KINDS=new Set(['conversation','explore','mystery','guessing','afterimage']);
const BAD_KEYS=new Set(['__proto__','prototype','constructor']);
const queues=new Map();
const bytes=value=>new TextEncoder().encode(value).byteLength;
const copy=value=>structuredClone(value);
async function serialize(key,action){
  const locks=globalThis.navigator?.locks,name=`nox.device-store.write:${key}`;
  if(typeof locks?.request==='function')return locks.request(name,action);
  // This queue protects multiple instances in this realm only. Other tabs need
  // Web Locks, which is why crossTabSafe remains false for this fallback.
  const previous=queues.get(name)||Promise.resolve(),next=previous.catch(()=>{}).then(action);queues.set(name,next);
  try{return await next;}finally{if(queues.get(name)===next)queues.delete(name);}
}
export function isDeviceId(value){return typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(value)&&!BAD_KEYS.has(value);}
// These values remain plain text. Consumers must render with textContent or
// React escaping, including when the conversation itself discusses HTML/code.
export function deviceText(value,max=600){return typeof value==='string'&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)?value.replace(/\r\n?/g,'\n').trim():null;}
export function safeDeviceValue(value){
  let nodes=0;const seen=new WeakSet();
  function walk(current,depth){
    if(++nodes>15000||depth>14)return false;
    if(current===null||typeof current==='boolean')return true;
    if(typeof current==='number')return Number.isFinite(current);
    if(typeof current==='string')return current.length<=200000&&deviceText(current,200000)!==null;
    if(typeof current!=='object'||seen.has(current))return false;
    seen.add(current);
    if(Array.isArray(current))return current.length<=2000&&current.every(v=>walk(v,depth+1));
    const prototype=Object.getPrototypeOf(current);if(prototype!==Object.prototype&&prototype!==null)return false;
    return Object.keys(current).length<=100&&Object.entries(current).every(([key,v])=>!BAD_KEYS.has(key)&&key.length<=100&&walk(v,depth+1));
  }
  try{return walk(value,0);}catch{return false;}
}

// Read, build and commit each mutation within one exclusive origin-wide lock.
// Unreadable data is never replaced by an ordinary save, import or clear.
export function createBoundedDeviceStore(storage,{key,field,validate,limit=100,maxBytes=1500000,identity=record=>record.id}){
  let records=[],readError=null,writeError=null,rawBackup=null;
  const canWrite=()=>typeof storage?.getItem==='function'&&typeof storage?.setItem==='function';
  const crossTabSafe=()=>typeof globalThis.navigator?.locks?.request==='function';
  const normalize=list=>{
    if(!Array.isArray(list)||list.length>limit)throw Error('limit-reached');
    const seen=new Set(),identities=new Set();return list.map(record=>{const valid=validate(record);if(!valid||seen.has(valid.id)||identities.has(identity(valid)))throw Error('invalid-data');seen.add(valid.id);identities.add(identity(valid));return valid;});
  };
  const pack=items=>JSON.stringify({version:1,[field]:items});
  function parse(serialized){
    if(typeof serialized!=='string'||bytes(serialized)>maxBytes)throw Error('too-large');
    const envelope=JSON.parse(serialized);
    if(!safeDeviceValue(envelope)||envelope?.version!==1)throw Error('invalid-data');
    return normalize(envelope[field]);
  }
  function refresh(){
    if(typeof storage?.getItem!=='function'){readError='storage-unavailable';return false;}
    try{
      const raw=storage.getItem(key);rawBackup=typeof raw==='string'?raw:null;
      const next=raw===null||raw===undefined?[]:parse(raw);records=next;readError=null;return true;
    }catch{readError='unreadable-storage';return false;}
  }
  function commit(candidate){
    try{
      const next=normalize(candidate),serialized=pack(next);
      if(!safeDeviceValue({version:1,[field]:next}))throw Error('invalid-data');
      if(bytes(serialized)>maxBytes)throw Error('too-large');
      if(!canWrite())throw Error('storage-unavailable');
      storage.setItem(key,serialized);records=next;rawBackup=serialized;writeError=null;return true;
    }catch(cause){writeError=['too-large','limit-reached','invalid-data','storage-unavailable'].includes(cause.message)?cause.message:'storage-full-or-blocked';return false;}
  }
  async function mutate(build,failure=null){
    const failed=()=>typeof failure==='function'?failure():failure;
    try{
      return await serialize(key,()=>{
        if(!refresh())return failed();
        const operation=build(copy(records));
        if(!operation)return failed();
        if(Object.hasOwn(operation,'candidate')){
          if(!commit(operation.candidate))return failed();
          operation.afterCommit?.();
        }
        return copy(operation.result);
      });
    }catch{writeError='storage-unavailable';return failed();}
  }
  refresh();
  return {
    get persistent(){return canWrite()&&!readError&&!writeError&&storage?.temporary!==true;},
    get crossTabSafe(){return crossTabSafe();},
    get status(){return {persistent:this.persistent,crossTabSafe:this.crossTabSafe,error:readError||writeError,count:records.length,limit,bytes:readError&&rawBackup!==null?bytes(rawBackup):bytes(pack(records)),maxBytes};},
    read(){refresh();return copy(records);},
    mutate,
    export(){
      if(!refresh()){
        if(rawBackup!==null)return rawBackup;
        // Do not disguise an unreadable store as a valid empty backup.
        throw Error('unreadable-storage');
      }
      return JSON.stringify({version:1,[field]:records},null,2);
    },
    import(serialized,{equivalent=(a,b)=>a.id===b.id}={}){
      return mutate(items=>{
        let incoming;try{incoming=parse(serialized);}catch{return {result:{ok:false,imported:0,error:'invalid-or-unsafe-import'}};}
        const additions=incoming.filter(item=>!items.some(existing=>equivalent(existing,item)));
        if(!additions.length)return {result:{ok:true,imported:0}};
        return {candidate:[...items,...additions],result:{ok:true,imported:additions.length}};
      },()=>({ok:false,imported:0,error:readError||writeError}));
    },
  };
}
function validateItem(item){
  if(!item||!safeDeviceValue(item)||!isDeviceId(item.id)||!KINDS.has(item.kind))return null;
  const title=deviceText(item.title,120);
  if(!title||!item.state||Array.isArray(item.state)||typeof item.state!=='object'||bytes(JSON.stringify(item.state))>180000)return null;
  if(!Number.isSafeInteger(item.createdAt)||item.createdAt<0||!Number.isSafeInteger(item.updatedAt)||item.updatedAt<item.createdAt)return null;
  return {id:item.id,kind:item.kind,title,state:copy(item.state),createdAt:item.createdAt,updatedAt:item.updatedAt};
}
export function createContinuity(storage){
  const store=createBoundedDeviceStore(storage,{key:KEY,field:'items',validate:validateItem});
  return {
    get persistent(){return store.persistent;},get crossTabSafe(){return store.crossTabSafe;},get status(){return store.status;},
    list(){return store.read().sort((a,b)=>b.updatedAt-a.updatedAt);},
    get(id){return store.read().find(item=>item.id===id)||null;},
    save(input){
      // Freeze the user's supplied snapshot now; the stored base is read later
      // inside the lock so another tab's saves/removals cannot be resurrected.
      let snapshot;try{snapshot=copy(input);}catch{return Promise.resolve(null);}
      return store.mutate(items=>{
        if(!snapshot||typeof snapshot!=='object')return null;
        const id=snapshot.id??globalThis.crypto.randomUUID(),previous=items.find(item=>item.id===id),now=Date.now();
        const item=validateItem({id,kind:snapshot.kind,title:snapshot.title,state:snapshot.state,createdAt:previous?.createdAt??now,updatedAt:Math.max(now,previous?.updatedAt??0)});
        if(!item)return null;
        return {candidate:previous?items.map(v=>v.id===id?item:v):[...items,item],result:item};
      });
    },
    remove(id){return store.mutate(items=>items.some(item=>item.id===id)?{candidate:items.filter(item=>item.id!==id),result:true}:{result:false},false);},
    clear(){return store.mutate(()=>({candidate:[],result:true}),false);},
    export:()=>store.export(),import:serialized=>store.import(serialized),
  };
}
