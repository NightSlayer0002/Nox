// Per warm function instance. Values expire; no external database or disk writes.
export function createCache({ttlMs=300000,maxEntries=12,maxBytes=12*1024*1024,now=Date.now}={}) {
  const entries=new Map(),pending=new Map();let bytes=0;
  const remove=key=>{const entry=entries.get(key);if(entry)bytes-=entry.size;entries.delete(key);};
  return {async getOrCreate(key,factory){
    const hit=entries.get(key);
    if(hit&&hit.until>now()){entries.delete(key);entries.set(key,hit);return {value:hit.value,hit:true};}
    if(hit)remove(key);
    if(pending.has(key))return {value:await pending.get(key),hit:true};
    const promise=Promise.resolve().then(factory);if(pending.size<maxEntries)pending.set(key,promise);
    try {
      const value=await promise,size=value.byteLength||0;
      if(size<=maxBytes){remove(key);entries.set(key,{value,size,until:now()+ttlMs});bytes+=size;while(entries.size>maxEntries||bytes>maxBytes)remove(entries.keys().next().value);}
      return {value,hit:false};
    }finally{if(pending.get(key)===promise)pending.delete(key);}
  }};
}
