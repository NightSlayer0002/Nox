export function fixtureWav(samples=[1,2], rate=24000) {
  const audio=Buffer.alloc(samples.length*2);samples.forEach((value,index)=>audio.writeInt16LE(value,index*2));
  const wave=Buffer.alloc(44+audio.length);
  wave.write('RIFF',0);wave.writeUInt32LE(wave.length-8,4);wave.write('WAVE',8);
  wave.write('fmt ',12);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(rate,24);wave.writeUInt32LE(rate*2,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);
  wave.write('data',36);wave.writeUInt32LE(audio.length,40);audio.copy(wave,44);return wave;
}
