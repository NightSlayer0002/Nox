import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { rm, mkdir } from 'node:fs/promises';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function buildClient(){
  const output=path.join(root,'public/dist');
  // Fixed workspace-owned generated directory, never a user-supplied target.
  await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
  const result=await build({absWorkingDir:root,entryPoints:{home:'client/home.jsx',workspace:'client/workspace.jsx','liquid-character':'client/liquid-character.js'},outdir:output,bundle:true,splitting:true,format:'esm',platform:'browser',target:['es2022'],minify:true,sourcemap:false,metafile:true,external:['/js/*'],chunkNames:'chunks/[name]-[hash]',assetNames:'assets/[name]-[hash]',jsx:'automatic',legalComments:'linked',define:{'process.env.NODE_ENV':'"production"'}});
  const entries=Object.entries(result.metafile.outputs).filter(([,v])=>v.entryPoint).map(([name,v])=>`${name}: ${(v.bytes/1024).toFixed(1)} KB`);
  console.log(`Client compiled: ${entries.join(', ')}`);return result.metafile;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await buildClient();
