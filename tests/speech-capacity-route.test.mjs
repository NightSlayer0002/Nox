import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createAppServer} from '../server.mjs';

test('speech capacity uses safe retryable HTTP errors before headers and an error record after streaming begins',async()=>{
  // Question: Does cache contention reach callers as retryable busy feedback without provider advice or leaked details?
  // Limits: Real loopback HTTP with synthetic speech failures; no live capacity, provider, playback, or global budget claim.
  for(const stage of ['audio','before-first-clip','after-first-clip']){
    const busy=()=>Object.assign(Error('PRIVATE cached key and upstream message: accept provider model terms.'),{code:'busy'});
    const server=createAppServer({hosted:true,publicHosts:['nox.example'],accessToken:'owner-fixture',providers:[],apiKey:'',
      naturalVoice:true,speechProvider:'groq',speechKey:'fixture',speech:async()=>{throw busy();},
      speechClips:async function*(){if(stage==='after-first-clip')yield Buffer.from('first');throw busy();},
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    try{
      const response=await new Promise((resolve,reject)=>{
        const request=http.request(`http://127.0.0.1:${server.address().port}/api/speech`,{method:'POST',headers:{
          host:'nox.example',origin:'https://nox.example',authorization:'Bearer owner-fixture','content-type':'application/json',
        }},resolve);
        request.on('error',reject);request.end(JSON.stringify({text:'Capacity probe.',...(stage==='audio'?{}:{stream:true})}));
      });
      const chunks=[];for await(const chunk of response)chunks.push(chunk);
      const text=Buffer.concat(chunks).toString();
      assert.doesNotMatch(text,/PRIVATE|cached key|upstream|terms|model access|account limits/i);
      let failure;
      if(stage==='after-first-clip'){
        assert.equal(response.statusCode,200);assert.match(response.headers['content-type'],/^application\/x-ndjson/);
        const records=text.trim().split('\n').map(JSON.parse);
        assert.deepEqual(records[0],{index:0,audio:'Zmlyc3Q=',type:'audio/wav'});
        assert.equal(records.length,2);failure=records[1];assert.equal(failure.done,undefined);
      }else{
        assert.equal(response.statusCode,429);assert.equal(response.headers['retry-after'],'2');
        assert.match(response.headers['content-type'],/^application\/json/);failure=JSON.parse(text);
      }
      assert.equal(failure.code,'busy');assert.equal(failure.retryAfter,2);
      assert.match(failure.error,/busy/i);assert.match(failure.error,/try again/i);
    }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  }
});
