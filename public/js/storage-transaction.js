// Durable read/modify/write operations must share one origin-wide lock. An
// in-memory guest store is isolated to its visit and needs no cross-tab lock.
// Fail closed on older browsers rather than describe a local queue as atomic.
export function createStorageTransaction(storage,name,{browser=typeof globalThis.window!=='undefined',locks=browser?globalThis.navigator?.locks:undefined}={}){
  const durable=storage?.temporary!==true&&typeof storage?.getItem==='function'&&typeof storage?.setItem==='function';
  const supported=!durable||typeof locks?.request==='function'||!browser;
  return {
    get supported(){return supported;},
    run(operation){
      if(!durable)return operation();
      if(typeof locks?.request==='function')return locks.request(name,operation);
      if(!browser)return operation(); // Synchronous injected storage in non-browser consumers.
      throw Error('This browser cannot safely coordinate saved changes across tabs because Web Locks are unavailable. Saved data is unchanged. Export a copy and use a browser with Web Locks support.');
    },
  };
}
