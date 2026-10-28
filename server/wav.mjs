// Orpheus accepts 200 characters. Keep all words, splitting near a space.
export function splitSpeech(text, limit=200) {
  const chunks=[];let remaining=text.trim();
  while(remaining.length>limit) {
    const space=remaining.lastIndexOf(' ',limit);
    let edge=space>=limit/2?space:limit;
    if(/[\uD800-\uDBFF]/.test(remaining[edge-1])) edge--;
    chunks.push(remaining.slice(0,edge).trim());remaining=remaining.slice(edge).trim();
  }
  if(remaining)chunks.push(remaining);return chunks;
}
// Rebalance the same clip count toward a shorter first synthesis. Never add a
// request just to reduce perceived latency, or cut a word to force a fast start.
export function startupSpeechChunks(text,limit=200){
  const original=splitSpeech(text,limit);if(original.length<2)return original;
  const clean=text.trim(),minimum=Math.max(60,clean.length-limit*(original.length-1));
  for(let edge=clean.indexOf(' ',minimum);edge>0&&edge<original[0].length;edge=clean.indexOf(' ',edge+1)){
    const rest=splitSpeech(clean.slice(edge),limit);
    if(rest.length<=original.length-1)return [clean.slice(0,edge).trim(),...rest];
  }
  return original;
}

function readWav(buffer) {
  if(buffer.length<12 || buffer.toString('ascii',0,4)!=='RIFF' || buffer.toString('ascii',8,12)!=='WAVE') throw new Error('Invalid WAV audio.');
  let format;const data=[];
  for(let offset=12;offset+8<=buffer.length;) {
    const id=buffer.toString('ascii',offset,offset+4),declared=buffer.readUInt32LE(offset+4),start=offset+8;
    const length=id==='data'&&declared===0xffffffff?buffer.length-start:declared;
    if(start+length>buffer.length)throw new Error('Truncated WAV audio.');
    const chunk=buffer.subarray(start,start+length);
    if(id==='fmt ')format=chunk;
    if(id==='data')data.push(chunk);
    offset=start+length+(length%2);
  }
  if(!format || format.length<16 || !data.length)throw new Error('Incomplete WAV audio.');
  let encoding=format.readUInt16LE(0);
  if(encoding===0xfffe && format.length>=40)encoding=format.readUInt16LE(24);
  const align=format.readUInt16LE(12);
  if(![1,3].includes(encoding) || !align || data.some(chunk=>chunk.length%align))throw new Error('Unsupported WAV format.');
  return {format,data,align,encoding};
}

// Validate one transport clip without rewriting metadata or streaming sentinels.
// Joining retains its existing format handling; transports also require frames
// and a complete declared RIFF container before a clip can enter their cache.
export function validateWav(buffer){
  const {format,data,align}=readWav(buffer),declared=buffer.readUInt32LE(4);
  if(declared!==0xffffffff&&declared!==buffer.length-8)throw new Error('Invalid WAV container length.');
  const channels=format.readUInt16LE(2),rate=format.readUInt32LE(4),bits=format.readUInt16LE(14);
  if(!channels||!rate||!bits||bits%8||align!==channels*bits/8||format.readUInt32LE(8)!==rate*align)throw new Error('Invalid WAV frame format.');
  if(!data.some(chunk=>chunk.length))throw new Error('Empty WAV audio.');
  return buffer;
}

// Concatenate audio frames, not complete WAV files. Rewrite RIFF/data lengths.
export function joinWav(buffers, maximum=2*1024*1024) {
  if(!buffers.length)throw new Error('No WAV audio.');
  const waves=buffers.map(readWav),first=waves[0];
  if(waves.some(wave=>!wave.format.equals(first.format)))throw new Error('WAV format changed between segments.');
  const pieces=waves.flatMap(wave=>wave.data),size=pieces.reduce((sum,piece)=>sum+piece.length,0);
  if(!size)throw new Error('Empty WAV audio.');
  const formatSize=first.format.length,formatPadding=formatSize%2,factSize=first.encoding===3?12:0;
  const dataOffset=20+formatSize+formatPadding+factSize,total=dataOffset+8+size+(size%2);
  if(total>maximum)throw new Error('Combined speech audio is too large.');
  const output=Buffer.alloc(total);
  output.write('RIFF',0);output.writeUInt32LE(total-8,4);output.write('WAVE',8);
  output.write('fmt ',12);output.writeUInt32LE(formatSize,16);first.format.copy(output,20);
  if(factSize){const offset=dataOffset-12;output.write('fact',offset);output.writeUInt32LE(4,offset+4);output.writeUInt32LE(size/first.align,offset+8);}
  output.write('data',dataOffset);output.writeUInt32LE(size,dataOffset+4);
  let cursor=dataOffset+8;for(const piece of pieces){piece.copy(output,cursor);cursor+=piece.length;}
  return output;
}
