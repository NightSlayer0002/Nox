// Bound transport envelopes before JSON parsing, independently of packet limits.
export const MAX_PROVIDER_JSON_BYTES=1024*1024;
export const MAX_UPSTREAM_ERROR_BYTES=16*1024;
export const MAX_ALLOWANCE_JSON_BYTES=16*1024;

export function cancelResponseBody(response){
  void response.body?.cancel().catch(()=>{});
}

export async function readBoundedJson(response,{maxBytes,signal}={}){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new TypeError('Supply a positive JSON byte limit.');
  const tooLarge=()=>new RangeError('Upstream JSON response is too large.');
  const invalid=()=>new SyntaxError('Upstream returned invalid JSON.');
  if(signal?.aborted){cancelResponseBody(response);signal.throwIfAborted();}
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maxBytes)){
    cancelResponseBody(response);throw tooLarge();
  }
  const reader=response.body?.getReader();
  if(!reader)throw invalid();
  let canceled=false,overflow=false,size=0;
  const cancel=()=>{if(!canceled){canceled=true;void reader.cancel().catch(()=>{});}};
  signal?.addEventListener('abort',cancel,{once:true});
  // One fixed buffer also bounds overhead for streams made of tiny chunks.
  const bytes=new Uint8Array(maxBytes);
  try{
    while(true){
      signal?.throwIfAborted();
      const {done,value}=await reader.read();
      signal?.throwIfAborted();
      if(done)break;
      if(!(value instanceof Uint8Array))throw invalid();
      size+=value.byteLength;
      if(size>maxBytes){overflow=true;throw tooLarge();}
      bytes.set(value,size-value.byteLength);
    }
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,size)));
  }catch(error){
    signal?.throwIfAborted();
    if(['AbortError','TimeoutError'].includes(error?.name))throw new DOMException('Upstream JSON reading was interrupted.',error.name);
    throw overflow?tooLarge():invalid();
  }finally{
    signal?.removeEventListener('abort',cancel);
    // Do not await upstream cleanup: a canceled reader must settle promptly.
    cancel();reader.releaseLock();
  }
}
