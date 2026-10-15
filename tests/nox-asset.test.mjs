import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const assetURL=new URL('../public/assets/nox/body-v1.glb',import.meta.url);

async function readAsset(){
  let bytes;
  try{bytes=await readFile(assetURL);}catch(error){assert.fail(`NOX Blender export must exist: ${error.code}`);}
  assert.ok(bytes.length<=1_000_000,'body stays within the 1 MB delivery budget');
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length,'GLB declares its complete file length');
  const chunks=[];
  for(let offset=12;offset<bytes.length;){
    const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);
    assert.ok(offset+8+length<=bytes.length,'chunk cannot run beyond the file');
    chunks.push({type,data:bytes.subarray(offset+8,offset+8+length)});offset+=8+length;
  }
  assert.deepEqual(chunks.map(chunk=>chunk.type),[0x4e4f534a,0x004e4942]);
  const json=JSON.parse(chunks[0].data.toString()),binary=chunks[1].data;
  function values(index){
    const accessor=json.accessors[index],view=json.bufferViews[accessor.bufferView];
    assert.ok(!accessor.sparse,'asset uses complete bounded buffers');
    const itemSize={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[accessor.type];
    const readers={5123:['getUint16',2],5125:['getUint32',4],5126:['getFloat32',4]};
    const [method,size]=readers[accessor.componentType]??[];assert.ok(method);
    const data=new DataView(binary.buffer,binary.byteOffset,binary.byteLength),out=[];
    for(let i=0;i<accessor.count;i++)for(let j=0;j<itemSize;j++){
      const offset=(view.byteOffset??0)+(accessor.byteOffset??0)+i*(view.byteStride??itemSize*size)+j*size;
      assert.ok(offset+size<=(view.byteOffset??0)+view.byteLength);
      out.push(data[method](offset,true));
    }
    return out;
  }
  return {json,values};
}

// Removing the shipped export, changing its topology or exporting a textured
// scene breaks the renderable-body contract checked against the real GLB.
test('Blender NOX is one local, closed indexed body within the delivery budget',async()=>{
  const {json,values}=await readAsset();
  for(const collection of ['buffers','images'])for(const item of json[collection]??[])assert.equal(item.uri,undefined,'no external or data URI resources');
  assert.equal(json.images?.length??0,0);assert.equal(json.cameras?.length??0,0);
  assert.equal(json.extensions?.KHR_lights_punctual,undefined);assert.equal(json.animations?.length??0,0);
  assert.equal(json.meshes.length,1);assert.equal(json.meshes[0].primitives.length,1);
  assert.equal(json.nodes.filter(node=>node.mesh!==undefined).length,1);
  const bodyNode=json.nodes.find(node=>node.mesh!==undefined);
  assert.equal(bodyNode.matrix,undefined);assert.equal(bodyNode.translation,undefined);
  assert.equal(bodyNode.rotation,undefined);assert.equal(bodyNode.scale,undefined);
  const primitive=json.meshes[0].primitives[0];assert.equal(primitive.mode??4,4);
  assert.ok(Number.isInteger(primitive.indices));
  const positions=values(primitive.attributes.POSITION),indices=values(primitive.indices);
  assert.ok(indices.length>0&&indices.length%3===0);assert.ok(indices.length/3<=10_000);
  for(const name of ['POSITION','NORMAL','TEXCOORD_0']){
    const data=values(primitive.attributes[name]);assert.ok(data.every(Number.isFinite),`${name} is finite`);
    assert.equal(data.length/(name==='TEXCOORD_0'?2:3),positions.length/3);
  }
  const normals=values(primitive.attributes.NORMAL);
  for(let i=0;i<normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...normals.slice(i,i+3))-1)<.001,'smooth surface normals have unit length');
  let frontPole=0;
  for(let i=2;i<positions.length;i+=3)if(Math.abs(positions[i]-104)<.001)frontPole++;
  assert.ok(frontPole>0&&frontPole<=3,'the front ends at a dome pole rather than a flat plate');
  const vertexKeys=[];
  for(let i=0;i<positions.length;i+=3)vertexKeys.push(positions.slice(i,i+3).map(value=>Math.round(value*10_000)).join(','));
  const edges=new Map();
  for(let i=0;i<indices.length;i+=3){
    const triangle=indices.slice(i,i+3).map(index=>{assert.ok(index<vertexKeys.length);return vertexKeys[index];});
    assert.equal(new Set(triangle).size,3,'no degenerate triangles');
    for(let j=0;j<3;j++){
      const a=triangle[j],b=triangle[(j+1)%3],key=[a,b].sort().join('|');
      const edge=edges.get(key)??{count:0,direction:0};edge.count++;edge.direction+=a<b?1:-1;edges.set(key,edge);
    }
  }
  for(const edge of edges.values()){assert.equal(edge.count,2,'each welded edge closes exactly two triangles');assert.equal(edge.direction,0,'winding is consistent');}
  for(let axis=0;axis<3;axis++){
    const coordinates=positions.filter((_,index)=>index%3===axis),min=Math.min(...coordinates),max=Math.max(...coordinates);
    assert.ok(Math.abs(min+max)<.1,'origin is centered');
    assert.ok(max-min>=[289,289,207][axis]&&max-min<=[291,291,210][axis],`axis ${axis} preserves the body frame`);
  }
});

// Missing, inert or oversized morphs cause interaction to disappear or the
// authored dome to cross the existing face texture at z=108.
test('NOX exports bounded, finite hold, directional wobble and local impact morphs',async()=>{
  const {json,values}=await readAsset(),mesh=json.meshes[0],primitive=mesh.primitives[0];
  assert.deepEqual(mesh.extras.targetNames,['Hold','WobbleLeft','WobbleRight','Impact']);
  assert.equal(primitive.targets.length,4);
  const positions=values(primitive.attributes.POSITION),deltas=[];
  for(const target of primitive.targets){
    const delta=values(target.POSITION);deltas.push(delta);assert.equal(delta.length,positions.length);
    assert.ok(delta.every(Number.isFinite));assert.ok(delta.some(value=>Math.abs(value)>.1),'morph has a visible effect');
    for(let i=0;i<delta.length;i+=3){
      assert.ok(Math.hypot(...delta.slice(i,i+3))<=9,'restrained body response');
      assert.ok(positions[i+2]+delta[i+2]<=106,'morphed front clears the face');
    }
    for(const accessor of Object.values(target))assert.ok(values(accessor).every(Number.isFinite));
  }
  for(let i=2;i<positions.length;i+=3)assert.ok(positions[i]+deltas.reduce((sum,delta)=>sum+Math.max(0,delta[i]),0)<=106,'combined positive weights clear the face');
  const left=deltas[1],right=deltas[2];
  for(let i=0;i<left.length;i+=3)assert.ok(Math.abs(left[i]+right[i])<.001,'opposed wobble directions');
});
