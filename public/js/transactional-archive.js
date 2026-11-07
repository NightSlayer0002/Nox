// IndexedDB owns durable notebook/story bytes. The original local copy stays
// available for explicit export/removal and never becomes a write-through mirror.
const DATABASE='nox.archives.v1',STORE='archives';

function isNativeStorage(storage,browser){
  if(!browser||storage?.temporary===true||typeof globalThis.Storage!=='function'||!(storage instanceof globalThis.Storage))return false;
  try{return storage===globalThis.localStorage;}catch{return false;}
}

export function createTransactionalArchive(storage,key,{browser=typeof window!=='undefined',indexedDB=globalThis.indexedDB,locks=globalThis.navigator?.locks,lockName,validate=()=>{}}={}){
  if(!isNativeStorage(storage,browser))return null;
  const listeners=new Set();let database,raw=null,revision=-1,error='',loaded=false,legacyCleared=false,protectedOriginal=false;
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('nox.archive.'+key):null;
  const message='Saved changes cannot be verified across tabs. Export a copy and close older NOX tabs before reloading.';
  function notify(){for(const listener of listeners){try{listener({raw,revision,error});}catch{}}}
  function fail(reason){error=reason?.message||message;notify();throw reason instanceof Error?reason:Error(error);}
  function accept(record){if(record.revision<revision)return;raw=record.raw;revision=record.revision;loaded=true;error='';notify();}
  function open(){
    if(database)return database;
    database=new Promise((resolve,reject)=>{
      if(!indexedDB?.open){reject(Error('This browser cannot open the saved archive. Export a copy and use a browser with IndexedDB.'));return;}
      const request=indexedDB.open(DATABASE,1);
      request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=null;};resolve(db);};
      request.onerror=()=>reject(request.error||Error('The saved archive could not be opened.'));
      request.onblocked=()=>reject(Error('Close older NOX tabs before opening the saved archive.'));
    });
    return database;
  }
  async function digest(value){
    const bytes=new TextEncoder().encode(JSON.stringify(value));
    const hash=await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  async function transact(operation,signal){
    signal?.throwIfAborted();const db=await open();signal?.throwIfAborted();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(STORE,'readwrite'),store=transaction.objectStore(STORE);let result,failed;
      const abort=()=>{failed=signal.reason;try{transaction.abort();}catch{}};
      signal?.addEventListener('abort',abort,{once:true});
      const finish=()=>signal?.removeEventListener('abort',abort);
      transaction.oncomplete=()=>{finish();resolve(result);};
      transaction.onabort=()=>{finish();reject(failed||transaction.error||Error('The saved archive transaction was cancelled.'));};
      transaction.onerror=()=>{};
      const request=store.get(key);
      request.onsuccess=()=>{
        try{signal?.throwIfAborted();result=operation(request.result,store);}
        catch(reason){failed=reason;transaction.abort();}
      };
    });
  }
  function locked(operation){
    if(typeof locks?.request!=='function')return Promise.reject(Error('This browser cannot coordinate migration with older NOX tabs. Export a copy and use a browser with Web Locks.'));
    return locks.request(lockName,operation);
  }
  async function currentLegacy(){
    const value=storage.getItem(key);
    if(value===null)legacyCleared=true;
    return {value,digest:value===null?null:await digest(value)};
  }
  function checkLegacy(record,legacy){
    if(legacy.value!==null&&(legacyCleared||legacy.digest!==record.legacyDigest))throw Error(message);
  }
  async function hydrate(){
    return locked(async()=>{
      const legacy=await currentLegacy();
      const record=await transact((saved,store)=>{
        if(saved){raw=saved.raw;revision=saved.revision;loaded=true;checkLegacy(saved,legacy);return saved;}
        try{validate(legacy.value);}catch(reason){protectedOriginal=true;throw reason;}
        const next={raw:legacy.value,revision:0,legacyDigest:legacy.digest};store.put(next,key);return next;
      });
      protectedOriginal=false;accept(record);return raw;
    }).catch(fail);
  }
  const ready=hydrate();
  const api={
    ready,
    get raw(){return raw;},
    get error(){return error;},
    get loaded(){return loaded;},
    get supported(){return typeof indexedDB?.open==='function'&&typeof locks?.request==='function';},
    get protectedOriginal(){return protectedOriginal;},
    get legacyRaw(){try{return storage.getItem(key);}catch{return null;}},
    get legacyBackup(){return loaded&&this.legacyRaw!==null;},
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    async refresh(){await ready.catch(()=>{});return hydrate();},
    async acknowledgeLegacy(expected){
      await ready.catch(()=>{});
      if(!loaded)return false;
      try{return await locked(async()=>{
        if(storage.getItem(key)!==expected)return false;
        const record=await transact(saved=>{
          if(!saved)throw Error('The saved archive is unavailable.');
          return saved;
        });
        if(storage.getItem(key)!==expected)return false;
        storage.removeItem(key);
        if(storage.getItem(key)!==null)throw Error('The older archive could not be removed. Export a copy before retrying.');
        legacyCleared=true;protectedOriginal=false;accept(record);return true;
      });}catch(reason){try{fail(reason);}catch{}return false;}
    },
    async run(transform,{signal}={}){
      await ready.catch(()=>{});signal?.throwIfAborted();
      if(!loaded)throw Error(error||'The saved archive is not ready.');
      let operationError,currentRecord;
      try{return await locked(async()=>{
        const legacy=await currentLegacy();
        const committed=await transact((record,store)=>{
          if(!record)throw Error('The saved archive disappeared. Export a copy and reload before editing.');
          currentRecord=record;
          checkLegacy(record,legacy);
          let change;
          try{change=transform(record.raw);}catch(reason){operationError=reason;throw reason;}
          if(!change||!Object.hasOwn(change,'raw'))throw Error('The archive change is invalid.');
          if(change.raw===record.raw)return {record,result:change.result,changed:false};
          const next={...record,raw:change.raw,revision:record.revision+1};
          store.put(next,key);return {record:next,result:change.result,changed:true};
        },signal);
        accept(committed.record);if(committed.changed)channel?.postMessage({revision});return committed.result;
      });}catch(reason){
        if(reason===operationError&&currentRecord)accept(currentRecord);
        else if(!signal?.aborted)fail(reason);
        throw reason;
      }
    },
  };
  channel?.addEventListener('message',event=>{if(event.data?.revision>revision)api.refresh().catch(()=>{});});
  // Foreground reads also refresh on browsers without BroadcastChannel.
  const foreground=()=>api.refresh().catch(()=>{});
  globalThis.window?.addEventListener('focus',foreground);
  globalThis.window?.addEventListener('pageshow',foreground);
  globalThis.window?.addEventListener('storage',event=>{
    if(event.storageArea&&event.storageArea!==storage||event.key!==key)return;
    if(event.newValue===null){legacyCleared=true;foreground();return;}
    if(loaded){error=message;notify();}
  });
  return api;
}
