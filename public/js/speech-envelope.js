const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

// Read provider WAV bytes locally. This is an amplitude envelope, not phoneme recognition.
export function wavEnvelope(buffer){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<44)return null;
  const view=new DataView(buffer),text=(at,size)=>String.fromCharCode(...new Uint8Array(buffer,at,size));
  if(text(0,4)!=='RIFF'||text(8,4)!=='WAVE')return null;
  let format,channels,rate,bits,align,data;
  for(let at=12;at+8<=buffer.byteLength;){
    const kind=text(at,4),size=view.getUint32(at+4,true),start=at+8,end=Math.min(buffer.byteLength,start+size);
    if(kind==='fmt '&&end-start>=16){format=view.getUint16(start,true);channels=view.getUint16(start+2,true);rate=view.getUint32(start+4,true);align=view.getUint16(start+12,true);bits=view.getUint16(start+14,true);}
    if(kind==='data'){data={start,end};break;}
    if(start+size>buffer.byteLength)break;at=start+size+(size%2);
  }
  if(!data||format!==1||bits!==16||channels<1||channels>8||align!==channels*2||rate<8000||rate>192000)return null;
  const step=.02,frameSize=Math.max(1,Math.round(rate*step)),samples=Math.floor((data.end-data.start)/align),levels=[];
  for(let first=0;first<samples;first+=frameSize){
    let power=0,count=0;
    for(let i=first;i<Math.min(samples,first+frameSize);i++)for(let ch=0;ch<channels;ch++){const sample=view.getInt16(data.start+i*align+ch*2,true)/32768;power+=sample*sample;count++;}
    const rms=Math.sqrt(power/Math.max(1,count));levels.push(rms<.012?0:clamp(Math.pow((rms-.008)*5,.65),0,1));
  }
  return {step,levels};
}
export function envelopeAt(envelope,seconds){return envelope?.levels[Math.floor(Math.max(0,seconds)/envelope.step)]||0;}
export function speechChunks(text){
  const parts=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('en',{granularity:'sentence'}).segment(text)].map(v=>v.segment):text.match(/[^.!?…]+[.!?…]*|[.!?…]+/gu)||[];
  return parts.map(v=>v.trim()).filter(Boolean);
}
export function speechTimeline(text,rate=1){
  let at=0;const words=[];
  for(const token of text.match(/[^\s,.!?;:…]+|[,;:]|[.!?…]+/gu)||[]){
    if(/^[,.!?;:…]+$/.test(token)){at+=/[.!?…]/.test(token)?.32:.14;continue;}
    const duration=clamp(.07+token.length*.038,.12,.6)/rate;
    words.push({start:at,end:at+duration});at+=duration+.035/rate;
  }
  return words;
}
export function timelineAt(timeline,seconds){
  const word=timeline?.find(v=>seconds>=v.start&&seconds<v.end);if(!word)return 0;
  return .25+.55*Math.abs(Math.sin((seconds-word.start)*24));
}
