// Compact transport of sourced BodyParts3D vertices and triangle indices.
export function decodeBrain(buffer){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<12)throw Error('Invalid brain geometry');
  const header=new DataView(buffer),vertices=header.getUint32(4,true),triangles=header.getUint32(8,true);
  if(header.getUint32(0,true)!==0x4e4f5842||vertices<3||vertices>180000||triangles<1||triangles>360000||buffer.byteLength!==12+vertices*12+triangles*12)throw Error('Invalid brain geometry bounds');
  const positions=new Float32Array(buffer,12,vertices*3),indices=new Uint32Array(buffer,12+vertices*12,triangles*3);
  if(!positions.every(Number.isFinite)||!indices.every(index=>index<vertices))throw Error('Invalid brain geometry values');
  return {positions,indices};
}
