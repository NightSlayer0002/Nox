// Offline, topology-preserving OBJ-to-binary transport. Input is an extracted official
// BodyParts3D 4.0 archive, never synthesized anatomy. See asset NOTICE.md.
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const input=process.argv[2];
if(!input)throw Error('Usage: node scripts/build-brain-asset.mjs <extracted OBJ directory>');
const ids=new Set(['FJ1732','FJ1733','FJ1739','FJ1740','FJ1744','FJ1745','FJ1746','FJ1747','FJ1783','FJ1784','FJ1785','FJ1786','FJ1787','FJ1788','FJ1789','FJ1790','FJ1791','FJ1792','FJ1793','FJ1794','FJ1797','FJ1798','FJ1800','FJ1801','FJ1833','FJ1834','FJ1835','FJ1836','FJ1837','FJ1838','FJ1839','FJ1840','FJ1841','FJ1842','FJ1781','FJ1830','FJ1775','FJ1822','FJ1769','FJ1831']);
const positions=[],indices=[],sources=[];
for(const file of (await readdir(input)).sort()){
  const id=file.match(/FJ\d+/)?.[0];if(!ids.has(id)||!file.endsWith('.obj'))continue;
  const bytes=await readFile(path.join(input,file)),offset=positions.length/3;
  for(const line of bytes.toString().split(/\r?\n/)){
    if(line.startsWith('v '))positions.push(...line.trim().split(/\s+/).slice(1).map(Number));
    if(line.startsWith('f ')){const face=line.trim().split(/\s+/).slice(1).map(v=>Number(v.split('/')[0])-1+offset);if(face.length!==3)throw Error('Expected original triangle topology');indices.push(...face);}
  }
  sources.push({id,file,sha256:createHash('sha256').update(bytes).digest('hex')});
}
if(sources.length!==ids.size)throw Error(`Missing sourced parts: ${sources.length}/${ids.size}`);
const buffer=Buffer.alloc(12+positions.length*4+indices.length*4);
buffer.writeUInt32LE(0x4e4f5842,0);buffer.writeUInt32LE(positions.length/3,4);buffer.writeUInt32LE(indices.length/3,8);
positions.forEach((v,i)=>buffer.writeFloatLE(v,12+i*4));indices.forEach((v,i)=>buffer.writeUInt32LE(v,12+positions.length*4+i*4));
const output='public/vendor/bodyparts3d';await mkdir(output,{recursive:true});await writeFile(`${output}/brain.bin`,buffer);
await writeFile(`${output}/geometry.json`,JSON.stringify({dataset:'BodyParts3D 4.0',source:'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip',sourceArchiveSha256:'40665852c49f218326590e204db91064a1ecfc3c6f8cbd7bbbcaac62c7cd409e',license:'CC-BY-4.0',licenseSource:'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html',modification:'Selected 40 cortical, cerebellar and brainstem meshes. Preserved original vertices and triangle topology; packed float32 positions and uint32 indices. Runtime reorientation, centering and uniform scaling only.',vertices:positions.length/3,triangles:indices.length/3,sha256:createHash('sha256').update(buffer).digest('hex'),sources},null,2)+'\n');
console.log(`${sources.length} source meshes, ${positions.length/3} vertices, ${indices.length/3} triangles, ${buffer.length} bytes`);
