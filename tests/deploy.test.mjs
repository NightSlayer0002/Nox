import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { buildVercel } from '../scripts/build-vercel.mjs';

test('Vercel build contains static module dependencies and all bounded API handlers, without private files', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'nox-build-'));
  try {
    await buildVercel(output);
    const routing=JSON.parse(await readFile(path.join(output,'config.json'),'utf8'));
    assert.equal(routing.version, 3);
    assert.match(routing.routes[0].headers['Content-Security-Policy'],/form-action 'self'/);
    assert.ok(routing.routes.some(route=>route.src.startsWith('/dist/chunks/')&&route.headers?.['Cache-Control'].includes('immutable')));
    const homeBundle=await readFile(path.join(output,'static/dist/home.js'),'utf8');
    const workspaceBundle=await readFile(path.join(output,'static/dist/workspace.js'),'utf8');
    assert.match(homeBundle,/\.\/chunks\/source-scene-/);assert.match(workspaceBundle,/\/js\/workbench\.js/);
    assert.ok((await readdir(path.join(output,'static/dist/chunks'))).some(file=>/^source-scene-.*\.js$/.test(file)));
    for(const source of ['liquid-logo/fragment-shader.glsl','liquid-glass-js/glass.frag','sources.json'])assert.ok((await readFile(path.join(output,'static/vendor',source),'utf8')).length>0);
    assert.match(await readFile(path.join(output,'static/index.html'),'utf8'), /NOX/);
    assert.match(await readFile(path.join(output,'static/shared/character.js'),'utf8'), /normalizePacket/);
    const sharedAfterimage=await import(pathToFileURL(path.join(output,'static/shared/afterimage.js')));
    assert.equal(sharedAfterimage.sanitizeAfterimageInput({seed:'A moon',tone:'wonder'}).variation,0);
    assert.throws(()=>sharedAfterimage.normalizeAfterimage({title:'incomplete'}),TypeError);
    const files = await readdir(path.join(output,'static'));
    for (const secret of ['.env','.git','server.mjs','docs','artifacts']) assert.ok(!files.includes(secret));
    for (const endpoint of ['status','chat','speech','summary','session','afterimage']) {
      const folder = path.join(output,`functions/api/${endpoint}.func`);
      const config = JSON.parse(await readFile(path.join(folder,'.vc-config.json'),'utf8'));
      assert.equal(config.runtime,'nodejs24.x'); assert.equal(config.handler,'index.mjs');
      assert.match(await readFile(path.join(folder,'index.mjs'),'utf8'), new RegExp(`/api/${endpoint}`));
      assert.ok((await readdir(folder)).includes('server.mjs'));
      assert.ok(!(await readdir(folder)).includes('.env'));
      // Vercel does not use local Node's automatic .js module detection.
      const entry = pathToFileURL(path.join(folder,'index.mjs')).href;
      const imported = spawnSync(process.execPath,['--no-experimental-detect-module','--input-type=module','-e',`const handler = await import(${JSON.stringify(entry)}); if(typeof handler.default !== 'function') throw new Error('Missing handler');`],{encoding:'utf8',cwd:folder});
      assert.equal(imported.status,0,imported.stderr);
    }
    await writeFile(path.join(output,'static/deleted-asset.txt'),'stale');
    await buildVercel(output);
    assert.ok(!(await readdir(path.join(output,'static'))).includes('deleted-asset.txt'));
    const originalOrigin=process.env.NOX_PUBLIC_ORIGIN;
    process.env.NOX_PUBLIC_ORIGIN='https://nox-build.example';
    try {
      const {default:handler}=await import(pathToFileURL(path.join(output,'functions/api/status.func/index.mjs')));
      const server=http.createServer(handler);
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      try {
        await new Promise((resolve,reject)=>{
          http.get(`http://127.0.0.1:${server.address().port}/api/status`,{headers:{host:'nox-build.example'}},response=>{
            let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>{try{assert.equal(response.statusCode,200);assert.ok(['demo','live'].includes(JSON.parse(body).brain));resolve();}catch(error){reject(error);}});
          }).on('error',reject);
        });
      } finally {await new Promise(resolve=>server.close(resolve));}
      const {default:afterimageHandler}=await import(pathToFileURL(path.join(output,'functions/api/afterimage.func/index.mjs')));
      const afterimageServer=http.createServer(afterimageHandler);
      await new Promise(resolve=>afterimageServer.listen(0,'127.0.0.1',resolve));
      try {
        await new Promise((resolve,reject)=>{
          const request=http.request(`http://127.0.0.1:${afterimageServer.address().port}/api/afterimage`,{method:'POST',headers:{host:'nox-build.example',origin:'https://foreign.example','content-type':'application/json'}},response=>{
            response.resume();response.on('end',()=>{try{assert.equal(response.statusCode,403);resolve();}catch(error){reject(error);}});
          });
          request.on('error',reject);request.end(JSON.stringify({seed:'A moon',tone:'wonder'}));
        });
      } finally {await new Promise(resolve=>afterimageServer.close(resolve));}
    } finally {if(originalOrigin===undefined)delete process.env.NOX_PUBLIC_ORIGIN;else process.env.NOX_PUBLIC_ORIGIN=originalOrigin;}
  } finally { await rm(output,{recursive:true,force:true}); }
});
