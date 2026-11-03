import { build,context } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { rm, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function prepareOutput(){
  const output=path.join(root,'public/dist');
  // Fixed workspace-owned generated directory, never a user-supplied target.
  await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
  return output;
}
function options(output){return {absWorkingDir:root,entryPoints:{home:'client/home.jsx',workspace:'client/workspace.jsx','liquid-character':'client/liquid-character.js','brain-character':'client/brain-character.js'},outdir:output,bundle:true,splitting:true,format:'esm',platform:'browser',target:['es2022'],minify:true,sourcemap:false,metafile:true,external:['/js/*'],chunkNames:'chunks/[name]-[hash]',assetNames:'assets/[name]-[hash]',jsx:'automatic',legalComments:'linked',define:{'process.env.NODE_ENV':'"production"'}};}
export async function buildClient(){
  const result=await build(options(await prepareOutput()));
  await buildOfflineWorker();
  const entries=Object.entries(result.metafile.outputs).filter(([,v])=>v.entryPoint).map(([name,v])=>`${name}: ${(v.bytes/1024).toFixed(1)} KB`);
  console.log(`Client compiled: ${entries.join(', ')}`);return result.metafile;
}
async function buildOfflineWorker(){
  const publicRoot=path.join(root,'public');
  const publicFiles=(await readdir(publicRoot,{recursive:true,withFileTypes:true}))
    .filter(entry=>entry.isFile())
    .map(entry=>path.relative(publicRoot,path.join(entry.parentPath,entry.name)).replaceAll(path.sep,'/'))
    .filter(file=>file!=='sw.js'&&(/^(?:js|dist|assets|vendor)\/.*\.(?:js|mjs|css|svg|png|jpe?g|webp|woff2?|glb|bin|gltf|glsl|vert|frag)$/i.test(file)||/^[^/]+\.(?:css|html|svg|webmanifest)$/.test(file)));
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const files=await Promise.all([...publicFiles.map(file=>[file,path.join(publicRoot,file)]),
    ...['character.js','afterimage.js','interface-state.js','rehearsal.js'].map(file=>[`shared/${file}`,path.join(root,'shared',file)])]
    .sort(([a],[b])=>a.localeCompare(b))
    .map(async ([url,file])=>['/'+url,hash(await readFile(file))]));
  const template=await readFile(path.join(publicRoot,'sw.js'),'utf8');
  const assets=JSON.stringify(Object.fromEntries(files));
  const release=hash(template+assets);
  await writeFile(path.join(publicRoot,'dist','sw.js'),`const RELEASE=${JSON.stringify(release)}, ASSETS=${assets};\n${template}`);
}
export async function watchClient(){
  const watcher=await context({...options(await prepareOutput()),plugins:[{name:'dev-build-status',setup(build){build.onEnd(result=>console.log(result.errors.length?'Client rebuild failed; fix the error above.':'Client rebuilt; refresh the browser to see changes.'));}}]});
  try{await watcher.rebuild();await watcher.watch();return watcher;}catch(error){await watcher.dispose();throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await buildClient();
