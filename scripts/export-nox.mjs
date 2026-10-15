// Run the installed Blender exporter; Three.js supplies only the established
// source contour. No network service or additional package is involved.
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile,rm,access} from 'node:fs/promises';
import path from 'node:path';
import {createLiquidGeometry} from '../client/liquid-geometry.js';

const root=path.resolve(import.meta.dirname,'..');
const source=path.join(root,'assets-source','nox');
const output=path.join(root,'public','assets','nox','body-v1.glb');
const blender=process.env.BLENDER_PATH||'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const args=process.argv.slice(2);
if(args.some(arg=>!['--rebuild-source','--preview'].includes(arg)))throw new Error('Usage: node scripts/export-nox.mjs [--rebuild-source] [--preview]');
await mkdir(source,{recursive:true});await mkdir(path.dirname(output),{recursive:true});
const seed=path.join(source,'.export-input.json'),blend=path.join(source,'nox.blend');
const geometry=createLiquidGeometry();
try{
  await writeFile(seed,JSON.stringify({
    positions:Array.from(geometry.attributes.position.array),
    uv:Array.from(geometry.attributes.uv.array),
    indices:Array.from(geometry.index.array)
  }));
  const options=['--background','--factory-startup','--python-exit-code','1','--python',path.join(source,'export_nox.py'),'--','--seed',seed,'--blend',blend,'--output',output];
  if(args.includes('--rebuild-source'))options.push('--rebuild-source');
  if(args.includes('--preview'))options.push('--preview',path.join(source,'preview.png'));
  const result=spawnSync(blender,options,{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`Blender export failed (${result.status})`);
  await access(output);
}finally{geometry.dispose();await rm(seed,{force:true});}
