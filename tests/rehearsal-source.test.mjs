import test from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {
  parseRepositoryUrl, loadRepository, loadRepositoryFile, readCodeFile, validateCodeSource,
} from '../public/js/rehearsal-source.js';

// Question: can pasted, local and repository input keep exact source text while rejecting
// unbounded, binary, sensitive or ambiguous input before it reaches a rehearsal?
// Limits: external fetch is replaced with Response streams; no GitHub quota, browser CORS,
// model quality, secret detection completeness or repository execution is being tested.

test('repository URLs accept only a GitHub repository root, with an optional .git suffix', () => {
  assert.deepEqual(parseRepositoryUrl(' https://github.com/octocat/Hello-World.git/ '), {owner:'octocat', repo:'Hello-World'});
  for (const input of [
    'http://github.com/a/b', 'https://github.com.evil.test/a/b', 'https://evil.test/a/b',
    'https://github.com@evil.test/a/b', 'https://user@github.com/a/b',
    'https://github.com:443/a/b', 'https://github.com/a/b/tree/main',
    'https://github.com/a/b?tab=readme', 'https://github.com/a/b#readme',
    'https://github.com/a/../b', 'https://github.com/a/%2e%2e',
    'https://github.com/a/b\\c', 'https://github.com/a/.git', '', null,
  ]) assert.throws(() => parseRepositoryUrl(input), /repository.*https:\/\/github\.com\/owner\/repo/i, String(input));
});

test('source normalization retains Unicode, literal markup and every trailing blank line', () => {
  assert.deepEqual(validateCodeSource({path:'src/main.ts', text:'// नमस्ते 👋\r\n<x>\r\n\r\n'}), {
    path:'src/main.ts', text:'// नमस्ते 👋\n<x>\n\n', revision:'pasted', source:'pasted', url:'',
  });
  assert.equal(validateCodeSource({path:'Dockerfile', text:'FROM scratch\rRUN true\n'}).text, 'FROM scratch\nRUN true\n');
});

test('source limits use UTF-8 bytes and exact lines instead of silently clipping', () => {
  assert.equal(validateCodeSource({path:'a.js', text:'a'.repeat(65536)}).text.length, 65536);
  assert.throws(() => validateCodeSource({path:'a.js', text:'é'.repeat(32769)}), /64 KiB/i);
  assert.equal(validateCodeSource({path:'a.py', text:'\n'.repeat(1999)}).text.length, 1999);
  assert.throws(() => validateCodeSource({path:'a.py', text:'\n'.repeat(2000)}), /2,000 lines/i);
});

test('sensitive filenames and disguised paths are rejected for every source origin', () => {
  for (const path of [
    '.env', '.env.local', 'config/production.env', '.envrc', 'keys/private.key',
    'cert.pem', 'cert.crt', 'credentials.json', '.aws/credentials', 'id_rsa',
    'service-account.json', 'secrets.yml', '../main.js', '/main.js', 'a/../main.js',
    'a//main.js', 'a\\main.js', 'https://example.test/a.js', 'a\u202e.js', 'a.png',
  ]) assert.throws(() => validateCodeSource({path, text:'plain text'}), /sensitive|path|text source/i, path);
});

test('encoded NULs and invalid Unicode cannot disguise source paths', () => {
  for (const path of ['src/a%00.js', 'src/a%0A.js', 'src%2fmain.js', 'src/\ud800.js']) {
    assert.throws(() => validateCodeSource({path, text:'plain text'}), /path|UTF/i, path);
  }
});

test('binary text, controls, lone surrogates and private keys are rejected', () => {
  for (const text of ['a\0b', 'a\u0001b', 'a\u007fb', '\ud800', '-----BEGIN RSA PRIVATE KEY-----\nabc']) {
    assert.throws(() => validateCodeSource({path:'innocent.js', text}), /text|binary|control|private key|UTF/i);
  }
  assert.throws(() => validateCodeSource({path:'a.js', text:42}), /text/i);
});

test('PGP private keys are rejected even when hidden in a source filename', () => {
  assert.throws(() => validateCodeSource({path:'example.js', text:'-----BEGIN PGP PRIVATE KEY BLOCK-----\nprivate data'}), /private key/i);
});

test('local files decode UTF-8 strictly and preserve the local source identity', async () => {
  assert.deepEqual(await readCodeFile(new File(['const café = "👋";\r\n'], 'main.js')), {
    path:'main.js', text:'const café = "👋";\n', revision:'local', source:'local', url:'',
  });
  await assert.rejects(readCodeFile(new File([new Uint8Array([0xc3, 0x28])], 'bad.js')), /UTF-8/i);
  await assert.rejects(readCodeFile(new File(['x'.repeat(65537)], 'large.js')), /64 KiB/i);
  await assert.rejects(readCodeFile(new File(['not code'], '.env.local')), /sensitive/i);
});

const COMMIT = 'a'.repeat(40), TREE = 'b'.repeat(40), BLOB = 'c'.repeat(40);
const BASE = 'https://api.github.com/repos/octocat/Hello-World';
const REPO_URL = 'https://github.com/octocat/Hello-World';
const json = (value, init = {}) => new Response(JSON.stringify(value), {headers:{'content-type':'application/json'}, ...init});
const entry = (path = 'src/main.js', overrides = {}) => ({path, mode:'100644', type:'blob', sha:BLOB, size:5, url:`${BASE}/git/blobs/${BLOB}`, ...overrides});
const metadata = {name:'Hello-World', full_name:'octocat/Hello-World', private:false, default_branch:'release/v1'};
const commit = {sha:COMMIT, commit:{tree:{sha:TREE, url:`${BASE}/git/trees/${TREE}`}}};
const tree = (entries, overrides = {}) => ({sha:TREE, url:`${BASE}/git/trees/${TREE}`, tree:entries, truncated:false, ...overrides});

function githubFixture({repository = metadata, revision = commit, branchName = metadata.default_branch, listing = tree([entry()]), blob} = {}) {
  const requests = [];
  const responses = new Map([
    [BASE, repository], [`${BASE}/branches/release%2Fv1`, {name:branchName, commit:revision}],
    [`${BASE}/git/trees/${TREE}?recursive=1`, listing], [`${BASE}/git/blobs/${BLOB}`, blob],
  ]);
  return {requests, fetchImpl:async (url, options) => {
    requests.push({url, options});
    assert.ok(responses.has(url), `Unexpected request: ${url}`);
    const response = responses.get(url);
    return response instanceof Response ? response : json(response);
  }};
}

test('repository loading resolves default branch once and pins the commit, tree and selectable blobs', async () => {
  const fixture = githubFixture({listing:tree([
    entry(), entry('.env'), entry('logo.png'), entry('huge.ts', {size:65537}),
    entry('link.js', {mode:'120000'}), entry('vendor', {type:'commit', mode:'160000'}),
    {path:'src', mode:'040000', type:'tree', sha:BLOB},
  ])});
  const repository = await loadRepository(REPO_URL, fixture);
  assert.deepEqual(repository, {name:'octocat/Hello-World', revision:COMMIT, url:REPO_URL, files:[{path:'src/main.js', sha:BLOB, size:5}], truncated:false});
  assert.deepEqual(fixture.requests.map(request => request.url), [BASE, `${BASE}/branches/release%2Fv1`, `${BASE}/git/trees/${TREE}?recursive=1`]);
  for (const {options} of fixture.requests) {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.headers['X-GitHub-Api-Version'], '2022-11-28');
    assert.equal(new Headers(options.headers).has('authorization'), false);
  }
});

// Question: can a large latest commit's diff prevent importing otherwise small source files?
// Limits: fixture responses establish endpoint choice and pinned identity, not live GitHub availability or CORS.
test('repository import does not download a latest commit diff', async () => {
  const fixture = githubFixture();
  let diffRequests = 0;
  const repository = await loadRepository(REPO_URL, {fetchImpl:async (url, options) => {
    if (url.includes('/commits/')) {
      diffRequests++;
      return json({...commit, files:[{patch:'x'.repeat(300000)}]});
    }
    return fixture.fetchImpl(url, options);
  }});
  assert.equal(repository.revision, COMMIT);
  assert.equal(repository.files[0].sha, BLOB);
  assert.equal(diffRequests, 0);
});

test('repository truncation reports both GitHub partial trees and the 2,000 usable-file cap', async () => {
  const many = Array.from({length:2001}, (_,i) => entry(`file-${i}.js`));
  const capped = await loadRepository(REPO_URL, githubFixture({listing:tree(many)}));
  assert.equal(capped.files.length, 2000);
  assert.equal(capped.truncated, true);
  const partial = await loadRepository(REPO_URL, githubFixture({listing:tree([entry()], {truncated:true})}));
  assert.equal(partial.truncated, true);
});

test('malformed repository, commit and tree metadata fail closed', async () => {
  for (const fixture of [
    {repository:{...metadata, private:true}}, {repository:{...metadata, default_branch:''}},
    {repository:{...metadata, full_name:'other/repo'}}, {revision:{...commit, sha:'main'}},
    {branchName:'different-branch'},
    {revision:{sha:COMMIT, commit:{tree:{sha:'../../elsewhere'}}}},
    {listing:tree([entry('../escape.js')])}, {listing:tree([entry('a.js', {sha:'bad'})])},
    {listing:tree([entry('a.js', {size:-1})])}, {listing:tree([entry(), entry()])},
    {listing:tree([entry()], {sha:COMMIT})}, {listing:tree([entry()], {truncated:'false'})},
  ]) await assert.rejects(loadRepository(REPO_URL, githubFixture(fixture)), /invalid|public|changed|path|duplicate/i);
});

test('GitHub error responses offer actionable paste or local alternatives', async () => {
  for (const status of [403, 429]) {
    await assert.rejects(loadRepository(REPO_URL, {fetchImpl:async () => json({message:'limited'}, {status})}), /quota|rate limit/i);
  }
  for (const status of [404, 409, 503]) {
    await assert.rejects(loadRepository(REPO_URL, {fetchImpl:async () => json({message:'unavailable'}, {status})}), /paste|local/i);
  }
  await assert.rejects(loadRepository(REPO_URL, {fetchImpl:async () => {throw new TypeError('Failed to fetch');}}), /paste|local/i);
});

test('redirected responses and unexpected response hosts are rejected', async () => {
  for (const properties of [{redirected:true}, {url:'https://other.test/data'}, {url:`${BASE}/elsewhere`}]) {
    const response = json(metadata);
    for (const [key, value] of Object.entries(properties)) Object.defineProperty(response, key, {value});
    await assert.rejects(loadRepository(REPO_URL, {fetchImpl:async () => response}), /redirect|location/i);
  }
});

test('response bytes are capped while streaming before JSON can be parsed', async () => {
  let canceled = false;
  const listing = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(128 * 1024).fill(32)); },
    cancel() { canceled = true; },
  }), {headers:{'content-type':'application/json'}});
  await assert.rejects(loadRepository(REPO_URL, githubFixture({listing})), /too large|response limit/i);
  assert.equal(canceled, true);
  const advertised = json(metadata, {headers:{'content-length':'99999999', 'content-type':'application/json'}});
  await assert.rejects(loadRepository(REPO_URL, {fetchImpl:async () => advertised}), /too large|response limit/i);
});

test('abort before and during loading prevents a repository result', async () => {
  const before = new AbortController(); before.abort();
  await assert.rejects(loadRepository(REPO_URL, {signal:before.signal, fetchImpl:async () => assert.fail('must not fetch')}), {name:'AbortError'});
  const during = new AbortController();
  const pending = loadRepository(REPO_URL, {signal:during.signal, fetchImpl:() => new Promise(() => {})});
  during.abort();
  await assert.rejects(pending, {name:'AbortError'});
});

test('an aborted response reader is canceled without returning partial JSON', async () => {
  const controller = new AbortController();
  let cancelCount = 0, started;
  const reading = new Promise(resolve => { started = resolve; });
  const response = new Response(new ReadableStream({
    pull() { started(); return new Promise(() => {}); },
    cancel() { cancelCount++; },
  }), {headers:{'content-type':'application/json'}});
  const pending = loadRepository(REPO_URL, {signal:controller.signal, fetchImpl:async () => response});
  await reading;
  controller.abort();
  await assert.rejects(pending, {name:'AbortError'});
  assert.equal(cancelCount, 1);
});

test('an unresponsive fetch cannot outlive the import deadline', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const pending = loadRepository(REPO_URL, {fetchImpl:() => new Promise(() => {})});
  const rejected = assert.rejects(pending, /timed out|deadline/i);
  t.mock.timers.tick(15000);
  await rejected;
});

function blobFixture(text, overrides = {}) {
  const bytes = Buffer.isBuffer(text) ? text : Buffer.from(text);
  return {sha:BLOB, size:bytes.length, encoding:'base64', content:bytes.toString('base64'), url:`${BASE}/git/blobs/${BLOB}`, ...overrides};
}

test('chosen file loads by its blob SHA with a pinned commit URL and strict UTF-8', async () => {
  const text = 'const café = "👋";\r\n\r\n';
  const fixture = githubFixture({listing:tree([entry('src/café main.js', {size:Buffer.byteLength(text)})]), blob:blobFixture(text)});
  const repository = await loadRepository(REPO_URL, fixture);
  assert.deepEqual(await loadRepositoryFile(repository, repository.files[0], fixture), {
    path:'src/café main.js', text:'const café = "👋";\n\n', revision:COMMIT, source:'github',
    url:`${REPO_URL}/blob/${COMMIT}/src/caf%C3%A9%20main.js`,
  });
  assert.equal(fixture.requests.at(-1).url, `${BASE}/git/blobs/${BLOB}`);
});

test('base64 wrapping is accepted but malformed UTF-8 bytes in a correctly sized blob are rejected', async () => {
  const wrapped = githubFixture({blob:blobFixture('hello', {content:'aGVs\nbG8=\n'})});
  const repository = await loadRepository(REPO_URL, wrapped);
  assert.equal((await loadRepositoryFile(repository, repository.files[0], wrapped)).text, 'hello');
  const invalidUtf8 = githubFixture({listing:tree([entry('src/main.js', {size:2})]), blob:blobFixture(Buffer.from([0xc3, 0x28]))});
  const invalidRepository = await loadRepository(REPO_URL, invalidUtf8);
  await assert.rejects(loadRepositoryFile(invalidRepository, invalidRepository.files[0], invalidUtf8), /UTF-8/i);
});

test('oversized blob response streams are rejected and canceled before parsing', async () => {
  let canceled = false;
  const blob = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(65536).fill(32)); },
    cancel() { canceled = true; },
  }), {headers:{'content-type':'application/json'}});
  const fixture = githubFixture({blob}), repository = await loadRepository(REPO_URL, fixture);
  await assert.rejects(loadRepositoryFile(repository, repository.files[0], fixture), /too large/i);
  assert.equal(canceled, true);
});

test('invalid JSON and response encodings cannot pass the metadata boundary', async () => {
  for (const response of [
    new Response('{"private":false,', {headers:{'content-type':'application/json'}}),
    new Response(new Uint8Array([0xc3, 0x28]), {headers:{'content-type':'application/json'}}),
    new Response(JSON.stringify(metadata), {headers:{'content-type':'text/html'}}),
  ]) await assert.rejects(loadRepository(REPO_URL, {fetchImpl:async () => response}), /invalid/i);
});

test('blob metadata, base64 and byte limits cannot disguise invalid source data', async () => {
  for (const data of [
    blobFixture('hello', {sha:COMMIT}), blobFixture('hello', {encoding:'utf-8'}),
    blobFixture('hello', {size:65537}), blobFixture('hello', {content:'aGVsbG8=extra'}),
    blobFixture('hello', {size:4}), blobFixture(Buffer.from([0xc3, 0x28])),
    blobFixture('a\0b'), blobFixture('hello', {content:'A'.repeat(130000)}),
  ]) {
    const fixture = githubFixture({blob:data});
    const repository = await loadRepository(REPO_URL, fixture);
    await assert.rejects(loadRepositoryFile(repository, repository.files[0], fixture), /invalid|UTF-8|binary|64 KiB|size|too large/i);
  }
});

test('only a listed source file with the original SHA and size may be fetched', async () => {
  const fixture = githubFixture();
  const repository = await loadRepository(REPO_URL, fixture);
  for (const file of [entry('elsewhere.js'), {...repository.files[0], sha:COMMIT}, {...repository.files[0], size:4}]) {
    await assert.rejects(loadRepositoryFile(repository, file, {fetchImpl:async () => assert.fail('must not fetch')}), /listed|changed|invalid/i);
  }
});
