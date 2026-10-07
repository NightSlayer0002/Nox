export async function readChatStream(response,onText) {
  if(!response.headers.get('content-type')?.includes('text/event-stream'))return response.json();
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result,size=0,speech='';
  function event(block){let name='message';const data=[];for(const line of block.split('\n')){if(line.startsWith('event:'))name=line.slice(6).trim();if(line.startsWith('data:'))data.push(line.slice(5).trimStart());}if(!data.length)return;const value=JSON.parse(data.join('\n'));if(name==='error')throw Error(value.error||'NOX could not finish the reply.');if(name==='text'){speech=typeof value.delta==='string'?speech+value.delta:typeof value.speech==='string'?value.speech:speech;onText(speech.slice(0,6000));}if(name==='final')result=value;}
  try {
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024*1024)throw Error('Reply stream is too large.');buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,'\n');let end;while((end=buffer.indexOf('\n\n'))>=0){event(buffer.slice(0,end));buffer=buffer.slice(end+2);}}
    if(!result)throw Error('NOX did not complete this reply.');return result;
  }finally{await reader.cancel().catch(()=>{});}
}
