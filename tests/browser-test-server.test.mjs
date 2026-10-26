import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserTestServer} from '../scripts/browser-test-server.mjs';

async function withFixture(run){
  const server=createBrowserTestServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const enter=async()=>{
    const response=await fetch(`${base}/app`);await response.text();
    const cookie=response.headers.get('set-cookie');
    assert.match(cookie,/^nox-ci-context=.+; Path=\/; HttpOnly; SameSite=Strict$/);
    return cookie.split(';')[0];
  };
  const chat=async(cookie,message='A synthetic quota isolation check.')=>{
    const response=await fetch(`${base}/api/chat`,{method:'POST',headers:{origin:base,'content-type':'application/json',cookie},body:JSON.stringify({message})});
    return {status:response.status,body:await response.json()};
  };
  try{await run({base,enter,chat});}
  finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

test('browser journeys have separate admission budgets while reloads and tabs retain their own limits',()=>withFixture(async({base,enter,chat})=>{
    const first=await enter();
    for(let index=0;index<30;index++)assert.equal((await chat(first)).status,200);
    const rejected=await chat(first);assert.equal(rejected.status,429);assert.equal(rejected.body.code,'rate_limit');
    const second=await enter();
    assert.notEqual(second,first);
    assert.equal((await chat(second)).status,200,'a new browser journey must not inherit the previous journey’s exhausted budget');
    const reload=await fetch(`${base}/app`,{headers:{cookie:first}});await reload.text();
    assert.equal(reload.headers.get('set-cookie'),null,'reload must retain the existing context');
    assert.equal((await chat(first)).status,429,'reloading or opening a same-context tab must not reset admission');
}));

test('a retry fixture starts with a failure again in a new browser context',()=>withFixture(async({enter,chat})=>{
  const first=await enter();
  assert.equal((await chat(first,'CI retry after failure')).status,502);
  assert.equal((await chat(first,'CI retry after failure')).status,200);
  const second=await enter();
  assert.equal((await chat(second,'CI retry after failure')).status,502,'another journey must exercise its own first failure');
  assert.equal((await chat(second,'CI retry after failure')).status,200);
}));
