// A short-lived cache in one warm server instance. No disk or external store.
// Each receiver can leave independently; upstream work stops when all leave.
export function createAfterimageCache({ttlMs=60000,maxEntries=12,maxBytes=512*1024,now=Date.now}={}){
  const entries=new Map(),pending=new Map();let bytes=0;
  const remove=key=>{const entry=entries.get(key);if(entry)bytes-=entry.size;entries.delete(key);};
  return {
    async getOrCreate(key,factory,{signal}={}){
      signal?.throwIfAborted();
      const cached=entries.get(key);
      if(cached&&cached.until>now()){entries.delete(key);entries.set(key,cached);return {value:JSON.parse(cached.encoded),hit:true};}
      if(cached)remove(key);
      let work=pending.get(key),hit=Boolean(work);
      if(!work){
        if(pending.size>=maxEntries)throw Object.assign(new Error('AFTERIMAGE is receiving other signals. Try again shortly.'),{code:'busy'});
        work={controller:new AbortController(),users:0,settled:false,promise:null};
        pending.set(key,work);
        work.promise=Promise.resolve().then(()=>{work.controller.signal.throwIfAborted();return factory(work.controller.signal);}).then(value=>{
          work.controller.signal.throwIfAborted();
          const encoded=JSON.stringify(value),size=Buffer.byteLength(encoded);
          if(size<=maxBytes){
            remove(key);entries.set(key,{encoded,size,until:now()+ttlMs});bytes+=size;
            while(entries.size>maxEntries||bytes>maxBytes)remove(entries.keys().next().value);
          }
          return encoded;
        }).finally(()=>{work.settled=true;if(pending.get(key)===work)pending.delete(key);});
      }
      work.users++;
      return new Promise((resolve,reject)=>{
        let done=false;
        const release=()=>{
          signal?.removeEventListener('abort',abort);work.users--;
          if(!work.users&&!work.settled){if(pending.get(key)===work)pending.delete(key);work.controller.abort();}
        };
        const abort=()=>{if(done)return;done=true;release();reject(signal.reason);};
        signal?.addEventListener('abort',abort,{once:true});
        work.promise.then(encoded=>{if(done)return;done=true;release();resolve({value:JSON.parse(encoded),hit});},error=>{if(done)return;done=true;release();reject(error);});
        if(signal?.aborted)abort();
      });
    },
  };
}
