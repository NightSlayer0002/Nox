const MAX_AUDIO=2*1024*1024,MAX_WIRE=3*1024*1024,MAX_CLIPS=4;
const invalid=()=>Error('Natural voice returned an invalid audio stream.');
const interrupted=()=>new DOMException('Speech stopped.','AbortError');

// One bounded reply, delivered as complete ordered audio files. Text has already
// been validated before this request; this parser never synthesizes draft text.
export async function* readSpeechClips(response,{signal}={}){
  if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/x-ndjson')throw invalid();
  const reader=response.body?.getReader();if(!reader)throw invalid();
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let buffer='',wireSize=0,audioSize=0,index=0;
  const abort=()=>{void reader.cancel().catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});
  function event(line){
    const value=JSON.parse(line);
    if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();
    const keys=Object.keys(value);
    if(keys.length===1&&typeof value.error==='string')throw Error('Natural voice could not respond.');
    if(keys.length===1&&value.done===true){if(!index)throw invalid();return null;}
    if(keys.length!==3||!keys.every(key=>['index','audio','type'].includes(key))||value.index!==index||index>=MAX_CLIPS||!['audio/wav','audio/mpeg'].includes(value.type))throw invalid();
    const encoded=value.audio;
    if(typeof encoded!=='string'||!encoded.length||encoded.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw invalid();
    const size=encoded.length/4*3-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
    if(!size||audioSize+size>MAX_AUDIO)throw invalid();
    const binary=atob(encoded);
    // Reject nonzero padding bits and alternate spellings before creating audio.
    if(btoa(binary)!==encoded)throw invalid();
    const bytes=new Uint8Array(binary.length);
    for(let at=0;at<binary.length;at++)bytes[at]=binary.charCodeAt(at);
    audioSize+=bytes.byteLength;index++;
    return {blob:new Blob([bytes],{type:value.type})};
  }
  try{
    while(true){
      if(signal?.aborted)throw interrupted();
      const {done,value}=await reader.read();
      if(signal?.aborted)throw interrupted();
      if(done){buffer+=decoder.decode();if(buffer.trim())buffer+='\n';}
      else{
        wireSize+=value.byteLength;if(wireSize>MAX_WIRE)throw invalid();
        buffer+=decoder.decode(value,{stream:true});
      }
      if(buffer.length>MAX_WIRE)throw invalid();
      let end;
      while((end=buffer.indexOf('\n'))>=0){
        if(signal?.aborted)throw interrupted();
        const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
        if(!line)continue;
        const clip=event(line);
        if(!clip)return;
        yield clip;
      }
      if(done)throw invalid();
    }
  }catch(error){
    if(signal?.aborted||error.name==='AbortError')throw interrupted();
    if(error.message==='Natural voice could not respond.')throw error;
    throw invalid();
  }finally{
    signal?.removeEventListener('abort',abort);
    await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}
