import { cp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
};

export async function buildVercel(destination = path.join(root,'.vercel/output')) {
  const output = path.resolve(destination);
  const defaultOutput = path.join(root,'.vercel/output');
  const temporary = path.dirname(output) === path.resolve(os.tmpdir()) && path.basename(output).startsWith('nox-build-');
  if (output !== defaultOutput && !temporary) throw new Error('Build destination must be .vercel/output or a NOX build temporary directory.');
  // Verify the absolute target above before deleting generated output.
  await rm(output,{recursive:true,force:true});
  await mkdir(output,{recursive:true});
  await cp(path.join(root,'public'),path.join(output,'static'),{recursive:true});
  await mkdir(path.join(output,'static/shared'),{recursive:true});
  await cp(path.join(root,'shared/character.js'),path.join(output,'static/shared/character.js'));
  for (const endpoint of ['status','chat','speech']) {
    const folder = path.join(output,`functions/api/${endpoint}.func`);
    await mkdir(folder,{recursive:true});
    await cp(path.join(root,'server.mjs'),path.join(folder,'server.mjs'));
    await cp(path.join(root,'server'),path.join(folder,'server'),{recursive:true});
    await cp(path.join(root,'shared'),path.join(folder,'shared'),{recursive:true});
    // Keep shared .js modules unambiguously ESM in the isolated function bundle.
    await writeFile(path.join(folder,'package.json'),JSON.stringify({private:true,type:'module'},null,2));
    await writeFile(path.join(folder,'index.mjs'),`import { createAppServer } from './server.mjs';\nconst handler = createAppServer({ hosted: true }).listeners('request')[0];\nexport default function(request, response) { request.url = '/api/${endpoint}'; return handler(request, response); }\n`);
    await writeFile(path.join(folder,'.vc-config.json'),JSON.stringify({runtime:'nodejs24.x',handler:'index.mjs',launcherType:'Nodejs',shouldAddHelpers:false,maxDuration:30},null,2));
  }
  await writeFile(path.join(output,'config.json'),JSON.stringify({version:3,routes:[
    {src:'/(.*)',headers:securityHeaders,continue:true},
    {src:'/',dest:'/index.html'},
    {handle:'filesystem'},
    {src:'/(.*)',status:404},
  ]},null,2));
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(`Vercel output ready: ${await buildVercel()}`);
}
