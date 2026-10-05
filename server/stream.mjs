export async function consumeSSE(response,onData,signal) {
  const reader=response.body?.getReader();if(!reader)throw Error('Provider returned no stream.');
  const decoder=new TextDecoder();let buffer='',size=0;
  const line=value=>{if(value.startsWith('data:')){const data=value.slice(5).trim();if(data&&data!=='[DONE]')onData(JSON.parse(data));}};
  try {
    while(true){signal?.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>128000)throw Error('Provider stream is too large.');buffer+=decoder.decode(value,{stream:true});let index;while((index=buffer.indexOf('\n'))>=0){line(buffer.slice(0,index).replace(/\r$/,''));buffer=buffer.slice(index+1);}}
    buffer+=decoder.decode();if(buffer.trim())line(buffer.trim());
  }finally{await reader.cancel().catch(()=>{});}
}

export function partialSpeech(raw) {
  const match=/"speech"\s*:\s*"/.exec(raw);if(!match)return '';
  let output='',i=match.index+match[0].length;
  for(;i<raw.length;i++) {
    const char=raw[i];if(char==='"')break;
    if(char!=='\\'){output+=char;continue;}
    const next=raw[++i];if(!next)break;
    if(next==='u'){const hex=raw.slice(i+1,i+5);if(!/^[a-f\d]{4}$/i.test(hex))break;output+=String.fromCharCode(parseInt(hex,16));i+=4;}
    else output+=({n:' ',r:' ',t:' ',b:' ',f:' ', '"':'"','\\':'\\','/':'/'}[next]||'');
  }
  // Do not expose a half surrogate pair while the next chunk is pending.
  return output.replace(/[\uD800-\uDBFF]$/,'').slice(0,420);
}
