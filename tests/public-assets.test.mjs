import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createAppServer} from '../server.mjs';

async function withServer(callback){
  const server=createAppServer({hosted:false,providers:[],accessToken:'',naturalVoice:false});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const request=pathname=>new Promise((resolve,reject)=>{http.get({hostname:'127.0.0.1',port:server.address().port,path:pathname},response=>{const data=[];response.on('data',chunk=>data.push(chunk));response.on('end',()=>resolve({status:response.statusCode,type:response.headers['content-type'],body:Buffer.concat(data)}));}).on('error',reject);});
  try{await callback(request);}finally{await new Promise(resolve=>server.close(resolve));}
}
test('the local server serves the real self-hosted font with its correct media type',()=>withServer(async request=>{
  const response=await request('/vendor/source-sans/SourceSans3VF-Upright.woff2');
  assert.equal(response.status,200);assert.equal(response.type,'font/woff2');assert.equal(response.body.subarray(0,4).toString(),'wOF2');
}));
test('the brain binary is available only under the public asset root',()=>withServer(async request=>{
  const response=await request('/vendor/bodyparts3d/brain.bin');
  assert.equal(response.status,200);assert.equal(response.type,'application/octet-stream');assert.equal(response.body.readUInt32LE(),0x4e4f5842);
  for(const pathname of ['/../server.mjs','/.env','/vendor/../../server.mjs'])assert.equal((await request(pathname)).status,404);
}));
