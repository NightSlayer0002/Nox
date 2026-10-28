// Per warm function instance. Values expire; no external database or disk writes.
export function createCache({ttlMs=300000,maxEntries=12,maxBytes=12*1024*1024,now=Date.now}={}) {
  const entries=new Map(),pending=new Map();let bytes=0;
  const remove=key=>{const entry=entries.get(key);if(entry)bytes-=entry.size;entries.delete(key);};
  return {async getOrCreate(key,factory,{signal}={}){
    signal?.throwIfAborted();
    const cached=entries.get(key);
    if(cached&&cached.until>now()){entries.delete(key);entries.set(key,cached);return {value:cached.value,hit:true};}
    if(cached)remove(key);
    let work=pending.get(key),hit=Boolean(work);
    if(!work){
      work={controller:new AbortController(),users:0,settled:false,promise:null};
      if(pending.size<maxEntries)pending.set(key,work);
      work.promise=Promise.resolve().then(()=>{work.controller.signal.throwIfAborted();return factory(work.controller.signal);}).then(value=>{
        work.controller.signal.throwIfAborted();
        const size=value.byteLength||0;
        if(size<=maxBytes){remove(key);entries.set(key,{value,size,until:now()+ttlMs});bytes+=size;while(entries.size>maxEntries||bytes>maxBytes)remove(entries.keys().next().value);}
        return value;
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
      work.promise.then(value=>{if(done)return;done=true;release();resolve({value,hit});},error=>{if(done)return;done=true;release();reject(error);});
      if(signal?.aborted)abort();
    });
  }};
}
