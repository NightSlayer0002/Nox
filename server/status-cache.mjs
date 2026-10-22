// Anonymous display snapshots only, scoped to one warm process. Generation
// authorization must continue using the allowance store's atomic take().
export function createStatusCache({now=Date.now,ttlMs=5000,maxEntries=512}={}){
  if(!Number.isFinite(ttlMs)||ttlMs<=0||!Number.isSafeInteger(maxEntries)||maxEntries<1)throw new RangeError('Status cache bounds must be positive.');
  const entries=new Map(),pending=new Map();
  function peek(key){
    const entry=entries.get(key);
    if(!entry)return undefined;
    if(entry.until<=now()){entries.delete(key);return undefined;}
    entries.delete(key);entries.set(key,entry);return entry.value;
  }
  function store(key,value){
    entries.delete(key);entries.set(key,{value,until:now()+ttlMs});
    while(entries.size>maxEntries)entries.delete(entries.keys().next().value);
  }
  function invalidate(key){
    entries.delete(key);
    const active=pending.get(key);if(active)active.superseded=true;
  }
  return {
    peek,invalidate,
    set(key,value){const active=pending.get(key);if(active)active.superseded=true;store(key,value);},
    async get(key,read){
      const cached=peek(key);if(cached!==undefined)return cached;
      const active=pending.get(key);if(active)return active.promise;
      // Do not start untracked reads when all coalescing slots are occupied.
      if(pending.size>=maxEntries)return null;
      const entry={superseded:false};pending.set(key,entry);
      entry.promise=Promise.resolve().then(read).then(value=>{
        if(entry.superseded)return peek(key)??null;
        store(key,value);return value;
      }).finally(()=>{if(pending.get(key)===entry)pending.delete(key);});
      return entry.promise;
    },
  };
}
