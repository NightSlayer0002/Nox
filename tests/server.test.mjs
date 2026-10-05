import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAppServer } from '../server.mjs';
import { requestNox } from '../server/ai.mjs';

// Undici replaces Host; use Node HTTP to exercise the hosted allowlist.
function hostedRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, options, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), {status: response.statusCode, headers: response.headers})));
    });
    request.on('error', reject); request.end(options.body);
  });
}

async function withServer(options, callback) {
  const server = createAppServer({providers:[],accessToken:'',defaultProvider:'openai',...options});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await callback(base); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('server status describes demo mode without exposing the key', async () => {
  await withServer({ apiKey: '' }, async base => {
    const response = await fetch(`${base}/api/status`);
    assert.deepEqual(await response.json(), { brain: 'demo', model: null, voice: 'browser', access: 'open',providers:[],provider:null });
    assert.equal((await fetch(`${base}/.env`)).status, 404);
    assert.equal((await fetch(`${base}/package.json`)).status, 404);
    assert.equal((await fetch(`${base}/shared/character.js`)).status, 200);
  });
});

test('hosted paid endpoints require owner access and accept only the configured HTTPS origin', async () => {
  let calls=0;
  await withServer({hosted:true,publicHosts:['nox.example'],apiKey:'test',accessToken:'owner-test',naturalVoice:true,speechProvider:'openai',
    chat:async () => {calls++; return {speech:'Hello',emotion:'happy',action:'none',memory:''};},
    speech:async () => {calls++; return Buffer.from('ID3');}},async base => {
    const headers={host:'nox.example','content-type':'application/json',origin:'https://nox.example'};
    const locked=await hostedRequest(`${base}/api/status`,{headers:{host:'nox.example'}});
    assert.deepEqual(await locked.json(),{brain:'demo',model:null,voice:'browser',access:'locked',providers:[],provider:null});
    for (const endpoint of ['chat','speech']) {
      const body=JSON.stringify(endpoint==='chat'?{message:'Hi'}:{text:'Hi',mode:'companion'});
      assert.equal((await hostedRequest(`${base}/api/${endpoint}`,{method:'POST',headers,body})).status,401);
      assert.equal((await hostedRequest(`${base}/api/${endpoint}`,{method:'POST',headers:{...headers,authorization:'Bearer owner-test',origin:'https://foreign.example'},body})).status,403);
      const response=await hostedRequest(`${base}/api/${endpoint}`,{method:'POST',headers:{...headers,authorization:'Bearer owner-test'},body});
      assert.equal(response.status,200);
      if(endpoint==='speech') {assert.match(response.headers.get('content-type'),/audio\/mpeg/); assert.equal(await response.text(),'ID3');}
    }
    assert.equal(calls,2);
    assert.equal((await hostedRequest(`${base}/api/status`,{headers:{host:'untrusted.example'}})).status,403);
  });
});

test('a hosted key without an access token never enables anonymous paid calls', async () => {
  await withServer({hosted:true,publicHosts:['nox.example'],apiKey:'test',accessToken:'',chat:async()=>{throw Error('must not run');}},async base => {
    const response=await hostedRequest(`${base}/api/chat`,{method:'POST',headers:{host:'nox.example','content-type':'application/json'},body:JSON.stringify({message:'Hi'})});
    assert.equal(response.status,401);
  });
});

test('chat without a key returns an explicit configuration error', async () => {
  await withServer({ apiKey: '' }, async base => {
    const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'hello' }) });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /key/i);
  });
});

test('only configured provider IDs can be selected and the model stays server-owned', async () => {
  const calls=[];
  await withServer({apiKey:'',providers:[{id:'groq',name:'GroqCloud',model:'fixture-model'},{id:'gemini',name:'Google Gemini',model:'fixture-google'}],providerRequest:async(input,config)=>{
    calls.push({input,config});return {speech:'Fresh model reply.',emotion:'curious',action:'none',memory:''};
  }},async base=>{
    const headers={'content-type':'application/json'};
    const response=await fetch(`${base}/api/chat`,{method:'POST',headers,body:JSON.stringify({message:'Hi',provider:'gemini',model:'injected',apiKey:'injected'})});
    assert.equal(response.status,200);assert.equal(calls[0].config.model,'fixture-google');assert.equal(calls[0].config.provider,'gemini');
    assert.equal((await fetch(`${base}/api/chat`,{method:'POST',headers,body:JSON.stringify({message:'Hi',provider:'https://evil.example'})})).status,400);
    assert.equal(calls.length,1);
  });
});

test('chat rejects malformed, oversized, and foreign-origin input before calling a model', async () => {
  await withServer({ apiKey: 'test-key', chat: async () => { throw new Error('must not run'); } }, async base => {
    for (const body of ['{broken', JSON.stringify({ message: '' }), JSON.stringify({ message: 'x'.repeat(1201) }), 'x'.repeat(17000)]) {
      const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      assert.ok([400, 413].includes(response.status), `unexpected ${response.status}`);
    }
    const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://foreign.example' }, body: JSON.stringify({ message: 'hello' }) });
    assert.equal(response.status, 403);
  });
});

test('chat sanitizes context and never exposes provider exception details', async () => {
  let seen;
  await withServer({ apiKey: 'test-key', chat: async input => { seen = input; return { speech: 'hello', emotion: 'happy', action: 'run_shell', memory: '' }; } }, async base => {
    const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: ' hello ', context: { mode: 'evil', secret: 'ignore' } }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).action, 'none');
    assert.equal(seen.message, 'hello');
    assert.equal(seen.context.mode, 'companion');
    assert.equal(seen.context.secret, undefined);
  });
  await withServer({ apiKey: 'test-key', chat: async () => { throw new Error('private key detail'); } }, async base => {
    const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'hello' }) });
    assert.equal(response.status, 502);
    assert.doesNotMatch(JSON.stringify(await response.json()), /private key detail/);
  });
});

test('provider parses real Responses output shape and sends a bounded schema', async () => {
  let sent;
  const packet = await requestNox({ message: 'hi', context: { mode: 'director', name: 'Abhi' } }, {
    apiKey: 'test-key', model: 'gpt-4.1-mini',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      sent = JSON.parse(options.body);
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ speech: 'Welcome, Abhi.', emotion: 'happy', action: 'takeover', memory: '' }) }] }] }), { status: 200 });
    },
  });
  assert.equal(packet.action, 'takeover');
  assert.equal(sent.store, false);
  assert.equal(sent.text.format.strict, true);
  assert.equal(sent.text.format.schema.additionalProperties, false);
  assert.equal(sent.input.at(-1).content, 'hi');
});

test('provider rejects upstream failures and refusals rather than inventing replies', async () => {
  await assert.rejects(() => requestNox({ message: 'hi' }, { apiKey: 'test', fetchImpl: async () => new Response('{}', { status: 429 }) }), /provider/i);
  await assert.rejects(() => requestNox({ message: 'hi' }, { apiKey: 'test', fetchImpl: async () => new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'declined' }] }] })) }), /usable|reply/i);
});

test('UTF-8 characters survive splitting a JSON request inside an emoji', async () => {
  let seen;
  await withServer({ apiKey: 'test', chat: async input => { seen = input.message; return { speech: 'hello', emotion: 'neutral', action: 'none', memory: '' }; } }, async base => {
    const data = Buffer.from(JSON.stringify({ message: 'hello 😀' }));
    const split = data.indexOf(Buffer.from('😀')) + 2;
    await new Promise((resolve, reject) => {
      const request = http.request(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' } }, response => {
        response.resume(); response.on('end', () => { try { assert.equal(response.statusCode, 200); resolve(); } catch (error) { reject(error); } });
      });
      request.on('error', reject);
      request.write(data.subarray(0, split));
      setTimeout(() => request.end(data.subarray(split)), 20);
    });
    assert.equal(seen, 'hello 😀');
  });
});
