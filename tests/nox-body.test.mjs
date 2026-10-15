import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BufferGeometry} from 'three';
import {loadNoxBody,createNoxBodyResource} from '../client/nox-body.js';

const morphNames=['Hold','WobbleLeft','WobbleRight','Impact'];
function fixture(mutate=()=>{}){
  const positions=new Float32Array([145,0,0,-145,0,0,0,145,0,0,-145,0,0,0,104,0,0,-104]);
  const normals=new Float32Array([1,0,0,-1,0,0,0,1,0,0,-1,0,0,0,1,0,0,-1]);
  const uv=new Float32Array(12),indices=new Uint16Array([0,2,4,2,1,4,1,3,4,3,0,4,2,0,5,1,2,5,3,1,5,0,3,5]);
  const arrays=[positions,normals,uv,indices,...morphNames.map(()=>new Float32Array(18))];
  let length=0;
  const bufferViews=arrays.map(array=>{const view={buffer:0,byteOffset:length,byteLength:array.byteLength};length+=array.byteLength;return view;});
  const accessors=arrays.map((array,i)=>({bufferView:i,componentType:i===3?5123:5126,count:i===3?24:6,type:i===3?'SCALAR':i===2?'VEC2':'VEC3',...(i===0?{min:[-145,-145,-104],max:[145,145,104]}:i>3?{min:[0,0,0],max:[0,0,0]}:{})}));
  const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{extras:{targetNames:[...morphNames]},primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,targets:morphNames.map((_,i)=>({POSITION:i+4}))}]}],buffers:[{byteLength:length}],bufferViews,accessors};
  const binary=new Uint8Array(length);arrays.forEach((array,i)=>binary.set(new Uint8Array(array.buffer),bufferViews[i].byteOffset));
  mutate(json,binary);
  const encoded=new TextEncoder().encode(JSON.stringify(json)),jsonLength=Math.ceil(encoded.length/4)*4;
  const result=new Uint8Array(12+8+jsonLength+8+binary.length),view=new DataView(result.buffer);
  view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,result.length,true);
  view.setUint32(12,jsonLength,true);view.setUint32(16,0x4e4f534a,true);result.fill(32,20,20+jsonLength);result.set(encoded,20);
  view.setUint32(20+jsonLength,binary.length,true);view.setUint32(24+jsonLength,0x004e4942,true);result.set(binary,28+jsonLength);
  return result;
}
const response=bytes=>new Response(bytes,{headers:{'content-type':'model/gltf-binary'}});
const loadBytes=bytes=>loadNoxBody({fetchImpl:async()=>response(bytes)});
function observedGeometry(){const geometry=new BufferGeometry();let disposals=0;geometry.addEventListener('dispose',()=>disposals++);return {geometry,get disposals(){return disposals;}};}
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}

test('a local GLB becomes named morph geometry with an idempotent disposer',async()=>{
  let requested;
  const body=await loadNoxBody({fetchImpl:async(url,options)=>{requested={url,options};return response(fixture());}});
  assert.equal(requested.url,'/assets/nox/body-v1.glb');assert.equal(requested.options.credentials,'same-origin');
  assert.equal(body.source,'blender');assert.deepEqual(body.morphTargets,{Hold:0,WobbleLeft:1,WobbleRight:2,Impact:3});
  assert.equal(body.geometry.index.count,24);assert.equal(body.geometry.morphAttributes.position.length,4);
  assert.equal(body.geometry.boundingBox.max.x,145);
  let disposed=0;body.geometry.addEventListener('dispose',()=>disposed++);body.dispose();body.dispose();assert.equal(disposed,1);
});

test('network errors and non-success responses reject the authored body',async()=>{
  await assert.rejects(loadNoxBody({fetchImpl:async()=>{throw new Error('offline');}}),/offline/);
  await assert.rejects(loadNoxBody({fetchImpl:async()=>new Response(null,{status:404})}),/response|404/i);
});

test('an over-budget stream is stopped before reading the rest',async()=>{
  let cancelled=false,reads=0;
  const stream=new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(524289));},cancel(){cancelled=true;}},{highWaterMark:0});
  await assert.rejects(loadNoxBody({fetchImpl:async()=>new Response(stream)}),/size|large|budget/i);
  assert.equal(reads,2);assert.equal(cancelled,true);
  await assert.rejects(loadNoxBody({fetchImpl:async()=>new Response(new Uint8Array(4),{headers:{'content-length':'1048577'}})}),/size|large|budget/i);
});

test('malformed and truncated containers are rejected before parsing',async()=>{
  await assert.rejects(loadBytes(new Uint8Array(50)),/GLB|header|magic/i);
  const bytes=fixture();await assert.rejects(loadBytes(bytes.slice(0,-4)),/GLB|length|truncat/i);
});

for(const [name,mutate] of [
  ['external buffer',json=>{json.buffers[0].uri='https://example.invalid/body.bin';}],
  ['embedded image',json=>{json.images=[{bufferView:0,mimeType:'image/png'}];}],
  ['texture',json=>{json.textures=[{}];}],
  ['unused material',json=>{json.materials=[{pbrMetallicRoughness:{metallicFactor:.5}}];}],
  ['extension',json=>{json.extensionsUsed=['KHR_draco_mesh_compression'];}],
  ['extra primitive',json=>{json.meshes[0].primitives.push(json.meshes[0].primitives[0]);}],
  ['triangle budget',json=>{json.accessors[3].count=30003;}],
  ['missing morph',json=>{json.meshes[0].extras.targetNames[3]='Unknown';}],
  ['nonfinite position',(_json,binary)=>{new DataView(binary.buffer).setFloat32(0,NaN,true);}],
  ['nonfinite morph', (json,binary)=>{new DataView(binary.buffer).setFloat32(json.bufferViews[4].byteOffset,Infinity,true);}],
  ['out-of-bounds index', (json,binary)=>{new DataView(binary.buffer).setUint16(json.bufferViews[3].byteOffset,600,true);}],
])test(`rejects ${name} without requesting a dependency`,async()=>{
  let requests=0;
  await assert.rejects(loadNoxBody({fetchImpl:async()=>{requests++;return response(fixture(mutate));}}));assert.equal(requests,1);
});

test('aborting a streamed body cancels its reader',async()=>{
  const controller=new AbortController();let cancel=false;
  const stream=new ReadableStream({start(target){target.enqueue(fixture().slice(0,24));},cancel(){cancel=true;}});
  const loading=loadNoxBody({signal:controller.signal,fetchImpl:async()=>new Response(stream)});
  await new Promise(resolve=>setImmediate(resolve));controller.abort();
  await assert.rejects(loading,{name:'AbortError'});assert.equal(cancel,true);
});

test('a failed load preserves the immediate procedural body and disposes it once',async()=>{
  const fallback=observedGeometry();let changes=0;
  const resource=createNoxBodyResource({fallbackGeometry:fallback.geometry,load:async()=>{throw new Error('offline');},onChange:()=>changes++});
  assert.equal(resource.geometry,fallback.geometry);assert.equal(resource.source,'procedural');
  await resource.ready;assert.equal(resource.geometry,fallback.geometry);assert.equal(changes,0);assert.equal(fallback.disposals,0);
  resource.dispose();resource.dispose();assert.equal(fallback.disposals,1);
});

test('success replaces and releases the fallback before notifying the renderer',async()=>{
  const fallback=observedGeometry();const pending=deferred();const changes=[];
  const body=await loadBytes(fixture());let disposals=0;body.geometry.addEventListener('dispose',()=>disposals++);
  const resource=createNoxBodyResource({fallbackGeometry:fallback.geometry,load:()=>pending.promise,onChange:state=>{changes.push({...state,fallbackDisposals:fallback.disposals});}});
  pending.resolve(body);await resource.ready;
  assert.equal(resource.geometry,body.geometry);assert.equal(resource.morphTargets.Hold,0);
  assert.equal(changes.length,1);assert.equal(changes[0].fallbackDisposals,1);assert.equal(changes[0].geometry,body.geometry);assert.equal(changes[0].source,'blender');
  resource.dispose();resource.dispose();assert.equal(disposals,1);assert.equal(fallback.disposals,1);
});

test('dispose aborts loading and releases a late result without installing it',async()=>{
  const fallback=observedGeometry(),pending=deferred();let signal,changes=0;
  const resource=createNoxBodyResource({fallbackGeometry:fallback.geometry,load:options=>{signal=options.signal;return pending.promise;},onChange:()=>changes++});
  await Promise.resolve();resource.dispose();assert.equal(signal.aborted,true);
  const body=await loadBytes(fixture());let disposals=0;body.geometry.addEventListener('dispose',()=>disposals++);pending.resolve(body);
  await resource.ready;assert.equal(changes,0);assert.equal(disposals,1);assert.equal(fallback.disposals,1);resource.dispose();assert.equal(disposals,1);
});

test('the exported Blender body passes the real runtime loader',async()=>{
  const bytes=await readFile(new URL('../public/assets/nox/body-v1.glb',import.meta.url));
  const body=await loadBytes(bytes);assert.equal(body.source,'blender');assert.ok(body.geometry.index.count/3<=10000);
  assert.deepEqual(Object.keys(body.morphTargets),morphNames);body.dispose();
});
