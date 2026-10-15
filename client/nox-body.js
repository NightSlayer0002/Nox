import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {LoadingManager} from 'three';

const BODY_URL='/assets/nox/body-v1.glb';
const MAX_BYTES=1048576;
const MORPHS=['Hold','WobbleLeft','WobbleRight','Impact'];
const fail=message=>{throw new Error(`Invalid NOX body: ${message}`);};
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const checkAbort=signal=>{if(signal?.aborted)throw new DOMException('Body loading aborted','AbortError');};

async function readBody(response,signal){
  if(!response?.ok||response.redirected)fail(`response ${response?.status}`);
  const reader=response.body?.getReader();
  if(!reader)fail('response has no readable body');
  const chunks=[];let length=0;
  const abort=()=>{void reader.cancel().catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});
  try{
    if(Number(response.headers?.get('content-length'))>MAX_BYTES)fail('size exceeds budget');
    for(;;){
      checkAbort(signal);
      const {done,value}=await reader.read();checkAbort(signal);
      if(done)break;
      length+=value.byteLength;
      if(length>MAX_BYTES)fail('size exceeds budget');
      chunks.push(value);
    }
    const bytes=new Uint8Array(length);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return bytes.buffer;
  }catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{signal?.removeEventListener('abort',abort);reader.releaseLock();}
}

// Validate the resource graph before GLTFLoader sees it. This format deliberately
// supports only the small, uncompressed, self-contained authored body contract.
function validateBody(buffer){
  const data=new DataView(buffer);
  if(data.byteLength<28||data.getUint32(0,true)!==0x46546c67||data.getUint32(4,true)!==2)fail('GLB header');
  if(data.getUint32(8,true)!==data.byteLength)fail('GLB length is truncated or inconsistent');
  const jsonLength=data.getUint32(12,true),binHeader=20+jsonLength;
  if(jsonLength%4||data.getUint32(16,true)!==0x4e4f534a||binHeader+8>data.byteLength)fail('GLB JSON chunk');
  const binLength=data.getUint32(binHeader,true),binStart=binHeader+8;
  if(binLength%4||data.getUint32(binHeader+4,true)!==0x004e4942||binStart+binLength!==data.byteLength)fail('GLB binary chunk');
  let json;
  try{json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(buffer,20,jsonLength)));}
  catch{fail('GLB JSON content');}
  function noResources(value){
    if(!value||typeof value!=='object')return;
    for(const [key,child] of Object.entries(value)){
      if(key==='uri'||key==='extensions'&&Object.keys(child??{}).length||key==='extensionsUsed'&&child?.length||key==='extensionsRequired'&&child?.length)fail('external resources or extensions are forbidden');
      if(/texture/i.test(key))fail('textures are forbidden');
      noResources(child);
    }
  }
  noResources(json);
  for(const name of ['images','textures','samplers','materials','skins','animations','cameras'])if(json[name]?.length)fail(`${name} resources are forbidden`);
  if(json.asset?.version!=='2.0'||json.buffers?.length!==1||!integer(json.buffers[0].byteLength)||json.buffers[0].byteLength>binLength||binLength-json.buffers[0].byteLength>3)fail('embedded buffer');
  if(json.meshes?.length!==1||json.meshes[0].primitives?.length!==1)fail('exactly one body mesh and primitive required');
  if(json.scenes?.length!==1||(json.scene??0)!==0||json.scenes[0].nodes?.length!==1||json.scenes[0].nodes[0]!==0||json.nodes?.length!==1||json.nodes[0].mesh!==0)fail('single body scene required');
  const node=json.nodes[0];
  if(node.children?.length||node.skin!==undefined||node.camera!==undefined||node.matrix||node.translation?.some(x=>x!==0)||node.rotation?.some((x,i)=>x!==(i===3?1:0))||node.scale?.some(x=>x!==1))fail('body transforms must be applied');
  const primitive=json.meshes[0].primitives[0];
  if(primitive.material!==undefined)fail('imported materials are forbidden');
  if((primitive.mode??4)!==4||!integer(primitive.indices))fail('indexed triangles required');
  if(Object.keys(primitive.attributes??{}).some(key=>!['POSITION','NORMAL','TEXCOORD_0'].includes(key)))fail('unsupported body attributes');
  const names=json.meshes[0].extras?.targetNames;
  if(!Array.isArray(names)||names.length!==4||new Set(names).size!==4||MORPHS.some(name=>!names.includes(name))||primitive.targets?.length!==4)fail('expected four named morph targets');
  if(!Array.isArray(json.accessors)||json.accessors.length>32||!Array.isArray(json.bufferViews)||json.bufferViews.length>32)fail('body accessor budget');
  const types={SCALAR:1,VEC2:2,VEC3:3};
  function attribute(index,type,componentType,count){
    const accessor=json.accessors[index],view=json.bufferViews[accessor?.bufferView];
    if(!integer(index)||!accessor||accessor.type!==type||accessor.componentType!==componentType||accessor.sparse||accessor.normalized||!integer(accessor.count)||!accessor.count||accessor.count>30000||count!==undefined&&accessor.count!==count)fail('unsupported accessor');
    const componentBytes=componentType===5126||componentType===5125?4:2;
    const width=types[type],elementBytes=width*componentBytes,offset=accessor.byteOffset??0,stride=view?.byteStride??elementBytes;
    if(!view||view.buffer!==0||!integer(view.byteOffset??0)||!integer(view.byteLength)||!integer(offset)||!integer(stride)||stride<elementBytes||stride>252||stride%componentBytes||offset%componentBytes||(view.byteOffset??0)%componentBytes||(view.byteOffset??0)+view.byteLength>json.buffers[0].byteLength||offset+(accessor.count-1)*stride+elementBytes>view.byteLength)fail('accessor outside binary buffer');
    const result=[];
    for(let i=0;i<accessor.count;i++)for(let axis=0;axis<width;axis++){
      const at=binStart+(view.byteOffset??0)+offset+i*stride+axis*componentBytes;
      const value=componentType===5126?data.getFloat32(at,true):componentType===5125?data.getUint32(at,true):data.getUint16(at,true);
      if(!Number.isFinite(value))fail('nonfinite attribute');result.push(value);
    }
    return {count:accessor.count,values:result};
  }
  const position=attribute(primitive.attributes.POSITION,'VEC3',5126);
  attribute(primitive.attributes.NORMAL,'VEC3',5126,position.count);
  attribute(primitive.attributes.TEXCOORD_0,'VEC2',5126,position.count);
  const indexType=json.accessors[primitive.indices]?.componentType;
  if(![5123,5125].includes(indexType))fail('unsupported index accessor');
  const indices=attribute(primitive.indices,'SCALAR',indexType);
  if(indices.count%3||indices.count/3>10000||indices.values.some(value=>value>=position.count))fail('triangle budget or invalid index');
  const bounds=[0,1,2].map(axis=>{let min=Infinity,max=-Infinity;for(let i=axis;i<position.values.length;i+=3){min=Math.min(min,position.values[i]);max=Math.max(max,position.values[i]);}return {min,max,size:max-min};});
  if(bounds.some((bound,axis)=>bound.size<(axis===2?190:280)||bound.size>(axis===2?220:300)||Math.abs(bound.min+bound.max)>2))fail('body bounds');
  for(const target of primitive.targets){
    if(!integer(target.POSITION)||Object.keys(target).some(key=>!['POSITION','NORMAL'].includes(key)))fail('unsupported morph target');
    const morph=attribute(target.POSITION,'VEC3',5126,position.count);
    if(morph.values.some(value=>Math.abs(value)>60))fail('morph exceeds deformation bounds');
    if(target.NORMAL!==undefined)attribute(target.NORMAL,'VEC3',5126,position.count);
  }
  return Object.fromEntries(names.map((name,index)=>[name,index]));
}

function releaseScene(gltf,keepGeometry){
  const geometries=new Set(),materials=new Set();
  for(const scene of gltf.scenes??[gltf.scene])scene.traverse(object=>{
    if(object.geometry&&object.geometry!==keepGeometry)geometries.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material])if(material)materials.add(material);
  });
  for(const geometry of geometries)geometry.dispose();
  for(const material of materials)material.dispose();
}

export async function loadNoxBody({fetchImpl=fetch,signal}={}){
  checkAbort(signal);
  const response=await fetchImpl(BODY_URL,{signal,credentials:'same-origin',redirect:'error'});
  const buffer=await readBody(response,signal),morphTargets=validateBody(buffer);checkAbort(signal);
  // Defense in depth: parsing this asset must never initiate another request.
  const manager=new LoadingManager();manager.setURLModifier(()=>fail('dependency request forbidden'));
  const gltf=await new GLTFLoader(manager).parseAsync(buffer,'');
  let geometry;
  try{
    checkAbort(signal);const meshes=[];gltf.scene.traverse(object=>{if(object.isMesh)meshes.push(object);});
    if(meshes.length!==1)fail('parsed body mesh count');
    geometry=meshes[0].geometry;geometry.computeBoundingBox();geometry.computeBoundingSphere();
    releaseScene(gltf,geometry);
  }catch(error){releaseScene(gltf);throw error;}
  let disposed=false;
  return {geometry,morphTargets,source:'blender',dispose(){if(disposed)return;disposed=true;geometry.dispose();}};
}

// The controller owns both fallback and loaded geometry. ready always settles
// successfully so optional asset failure cannot interrupt the renderer.
export function createNoxBodyResource({fallbackGeometry,load=loadNoxBody,onChange=()=>{}}={}){
  const controller=new AbortController();let geometry=fallbackGeometry,morphTargets={},source='procedural',body,disposed=false;
  const resource={
    get geometry(){return geometry;},get morphTargets(){return morphTargets;},get source(){return source;},
    dispose(){if(disposed)return;disposed=true;controller.abort();if(body)body.dispose();else fallbackGeometry?.dispose();},
    ready:null
  };
  resource.ready=Promise.resolve().then(()=>{
    if(disposed)return;
    return load({signal:controller.signal});
  }).then(result=>{
    if(!result)return;
    if(disposed){result.dispose();return;}
    fallbackGeometry?.dispose();body=result;geometry=result.geometry;morphTargets=result.morphTargets;source=result.source;
    onChange({geometry,morphTargets,source});
  }).catch(()=>{}).then(()=>resource);
  return resource;
}
