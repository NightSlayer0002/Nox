const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_SOURCE_LINES = 2000;
const MAX_REPOSITORY_FILES = 2000;
const MAX_TREE_BYTES = 2 * 1024 * 1024;
const MAX_BLOB_RESPONSE_BYTES = 128 * 1024;
const IMPORT_DEADLINE_MS = 15000;
const SHA = /^[a-f0-9]{40}$/;
const CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
const SOURCE_EXTENSIONS = new Set('js mjs cjs jsx ts mts cts tsx py pyi rb go rs c h cc cpp cxx hpp cs java kt kts swift m mm php phtml html htm css scss sass less vue svelte astro sh bash zsh fish ps1 psm1 bat cmd sql graphql gql json jsonc yaml yml toml xml ini cfg conf md mdx markdown rst txt r rmd jl lua pl pm ex exs erl hrl hs lhs scala sc clj cljs cljc edn elm dart fs fsx fsi vb vbs pas lisp el vim tex make cmake gradle proto sol tf hcl nix dockerfile'.split(' '));
const SOURCE_FILENAMES = new Set(['dockerfile', 'containerfile', 'makefile', 'gnumakefile', 'cmakelists.txt', 'jenkinsfile', 'rakefile', 'gemfile', 'procfile', 'vagrantfile', 'justfile']);

export function parseRepositoryUrl(input) {
  const match = typeof input === 'string' && input.trim().match(/^https:\/\/github\.com\/([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)\/([a-z0-9_.-]{1,100})\/?$/i);
  const repo = match?.[2]?.replace(/\.git$/i, '');
  if (!match || !repo || repo === '.' || repo === '..') {
    throw new Error('Enter a repository root URL: https://github.com/owner/repo (without a branch, file, query or fragment).');
  }
  return {owner:match[1], repo};
}

function assertPath(path) {
  if (typeof path !== 'string' || !path || path.length > 240 || /[\u0000-\u001f\u007f-\u009f\\:\u202a-\u202e\u2066-\u2069]/.test(path)
    || /%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c)/i.test(path)
    || path.split('/').some(part => !part || part === '.' || part === '..' || part.trim() !== part)) {
    throw new Error('Use a relative source file path without traversal, control characters or empty segments.');
  }
  for (const character of path) {
    const code = character.codePointAt(0);
    if (code >= 0xd800 && code <= 0xdfff) throw new Error('Source file paths must contain valid Unicode.');
  }
}

function assertCodePath(path) {
  assertPath(path);
  const parts = path.toLowerCase().split('/');
  if (parts.some(part => /(?:^|[._-])(?:env|secrets?|credentials?|private[._-]?keys?|service[._-]?accounts?)(?:$|[._-])/.test(part)
    || /^\.env/.test(part) || /^(?:keys?|certs?|certificates?|\.ssh|\.aws|\.gnupg|\.npmrc|\.pypirc|\.netrc)$/.test(part)
    || /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/.test(part)
    || /\.(?:key|pem|crt|cer|der|p12|pfx|p7b|p7c|jks|keystore|pub)$/.test(part))) {
    throw new Error('This filename may contain sensitive credentials, environment values, keys or certificates. Choose a different source file.');
  }
  const name = path.split('/').at(-1).toLowerCase();
  if (!SOURCE_FILENAMES.has(name) && !SOURCE_EXTENSIONS.has(name.split('.').at(-1))) {
    throw new Error('Choose a supported text source file, such as .js, .ts, .py, .json, .md or Dockerfile.');
  }
}

function decodeUtf8(bytes) {
  try { return new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(bytes); }
  catch { throw new Error('This file is not valid UTF-8 text. Save it as UTF-8 and try again.'); }
}

export function validateCodeSource({path, text, revision = 'pasted', source = 'pasted', url = ''} = {}) {
  assertCodePath(path);
  if (typeof text !== 'string') throw new Error('Source contents must be text.');
  if (text.length > MAX_SOURCE_BYTES || new TextEncoder().encode(text).byteLength > MAX_SOURCE_BYTES) {
    throw new Error('Source files must be at most 64 KiB. Paste a smaller source file or excerpt.');
  }
  if (CONTROLS.test(text)) throw new Error('Binary data or control characters cannot be loaded as source text.');
  for (const character of text) {
    const code = character.codePointAt(0);
    if (code >= 0xd800 && code <= 0xdfff) throw new Error('Source must be valid UTF-8 text without unpaired surrogates.');
  }
  if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/.test(text)) throw new Error('Source contains a private key. Remove it before rehearsing.');
  const normalized = text.replace(/\r\n?/g, '\n');
  if (normalized.split('\n').length > MAX_SOURCE_LINES) throw new Error('Source files must contain at most 2,000 lines. Paste a smaller source file or excerpt.');
  if (typeof revision !== 'string' || !revision || revision.length > 80 || /[\u0000-\u001f\u007f]/.test(revision)
    || !['pasted', 'local', 'github'].includes(source) || typeof url !== 'string') {
    throw new Error('Source identity is invalid. Reload the source file.');
  }
  if (url && !/^https:\/\/github\.com\/[a-z0-9-]+\/[a-z0-9_.-]+\/blob\/[a-f0-9]{40}\//i.test(url)) {
    throw new Error('Source URL must identify a pinned GitHub file.');
  }
  return {path, text:normalized, revision, source, url};
}

export async function readCodeFile(file) {
  assertCodePath(file?.name);
  if (!Number.isSafeInteger(file.size) || file.size < 0 || typeof file.arrayBuffer !== 'function') throw new Error('Choose a local text source file.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Source files must be at most 64 KiB. Choose a smaller file.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_SOURCE_BYTES || bytes.byteLength !== file.size) throw new Error('Source file size changed or exceeds 64 KiB. Choose the file again.');
  return validateCodeSource({path:file.name, text:decodeUtf8(bytes), revision:'local', source:'local'});
}

function invalidResponse() {
  return new Error('GitHub returned invalid repository data. Try again, paste code or choose a local file.');
}

function abortError() {
  return new DOMException('Source import canceled.', 'AbortError');
}

// One deadline spans all requests in an operation. The race also bounds injected
// transports that ignore AbortSignal; native fetch and body readers are canceled.
async function withDeadline(signal, work) {
  const controller = new AbortController();
  if (signal?.aborted) throw abortError();
  const forwardAbort = () => controller.abort(abortError());
  signal?.addEventListener('abort', forwardAbort, {once:true});
  const timer = setTimeout(() => controller.abort(new DOMException('GitHub import timed out. Paste code or choose a local file.', 'TimeoutError')), IMPORT_DEADLINE_MS);
  let rejectAborted;
  const aborted = new Promise((_, reject) => { rejectAborted = () => reject(controller.signal.reason); });
  controller.signal.addEventListener('abort', rejectAborted, {once:true});
  try { return await Promise.race([work(controller.signal), aborted]); }
  finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
    controller.signal.removeEventListener('abort', rejectAborted);
  }
}

function cancelBody(response) {
  response?.body?.cancel().catch(() => {});
}

async function boundedJson(response, maxBytes, signal) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    cancelBody(response);
    throw new Error('GitHub response is too large to import safely. Paste code or choose a local file.');
  }
  if (!response.body?.getReader || !/^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(response.headers.get('content-type') || '')) {
    cancelBody(response);
    throw invalidResponse();
  }
  const reader = response.body.getReader();
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, {once:true});
  let size = 0;
  // A single bounded buffer also limits memory for streams made of tiny chunks.
  const bytes = new Uint8Array(maxBytes);
  try {
    while (true) {
      if (signal.aborted) throw signal.reason;
      const {done, value} = await reader.read();
      if (signal.aborted) throw signal.reason;
      if (done) break;
      if (!(value instanceof Uint8Array)) throw invalidResponse();
      size += value.byteLength;
      if (size > maxBytes) {
        cancel();
        throw new Error('GitHub response is too large to import safely. Paste code or choose a local file.');
      }
      bytes.set(value, size - value.byteLength);
    }
    try { return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes.subarray(0, size))); }
    catch { throw invalidResponse(); }
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
    reader.releaseLock();
  }
}

async function githubJson(url, maxBytes, fetchImpl, signal) {
  if (signal.aborted) throw signal.reason;
  let response;
  try {
    response = await fetchImpl(url, {
      method:'GET', credentials:'omit', redirect:'error', referrerPolicy:'no-referrer', signal,
      headers:{Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28'},
    });
  } catch {
    if (signal.aborted) throw signal.reason;
    throw new Error('GitHub could not be reached. Check the repository URL, paste code or choose a local file.');
  }
  if (signal.aborted) { cancelBody(response); throw signal.reason; }
  if (response?.redirected || (response?.url && response.url !== url) || (response?.status >= 300 && response.status < 400)) {
    cancelBody(response);
    throw new Error('GitHub redirected this repository to another location. Enter its current repository root URL.');
  }
  if (response?.status !== 200) {
    cancelBody(response);
    if ([403, 429].includes(response?.status)) throw new Error('GitHub public API quota or rate limit reached. Try later, paste code or choose a local file.');
    if ([404, 409].includes(response?.status)) throw new Error('This public repository or revision is unavailable or empty. Check the URL, paste code or choose a local file.');
    throw new Error('GitHub is unavailable. Try later, paste code or choose a local file.');
  }
  return boundedJson(response, maxBytes, signal);
}

export async function loadRepository(input, {fetchImpl = globalThis.fetch, signal} = {}) {
  const {owner, repo} = parseRepositoryUrl(input);
  const name = `${owner}/${repo}`;
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  return withDeadline(signal, async requestSignal => {
    const metadata = await githubJson(base, 64 * 1024, fetchImpl, requestSignal);
    if (metadata?.private !== false || (metadata.visibility && metadata.visibility !== 'public')) throw new Error('Only public GitHub repositories can be loaded. Paste code or choose a local file.');
    if (typeof metadata.full_name !== 'string' || metadata.full_name.toLowerCase() !== name.toLowerCase()
      || typeof metadata.default_branch !== 'string' || !metadata.default_branch || metadata.default_branch.length > 255
      || /[\u0000-\u0020\u007f~^:?*\[\\]/.test(metadata.default_branch)) throw invalidResponse();
    // Branch metadata pins the same commit/tree without downloading its file diffs.
    const branch = await githubJson(`${base}/branches/${encodeURIComponent(metadata.default_branch)}`, 64 * 1024, fetchImpl, requestSignal);
    if (branch?.name !== metadata.default_branch) throw invalidResponse();
    const revision = branch?.commit?.sha, treeSha = branch?.commit?.commit?.tree?.sha;
    if (typeof revision !== 'string' || !SHA.test(revision) || typeof treeSha !== 'string' || !SHA.test(treeSha)) throw invalidResponse();
    const listing = await githubJson(`${base}/git/trees/${treeSha}?recursive=1`, MAX_TREE_BYTES, fetchImpl, requestSignal);
    if (listing?.sha !== treeSha || !Array.isArray(listing.tree) || listing.tree.length > 20000 || typeof listing.truncated !== 'boolean') throw invalidResponse();
    const files = [], seen = new Set();
    let truncated = listing.truncated;
    for (const file of listing.tree) {
      assertPath(file?.path);
      if (seen.has(file.path)) throw new Error('GitHub returned duplicate file paths. Reload the repository.');
      seen.add(file.path);
      if (typeof file.sha !== 'string' || !SHA.test(file.sha)
        || !['blob', 'tree', 'commit'].includes(file.type)
        || !(file.type === 'blob' ? ['100644', '100755', '120000'] : file.type === 'tree' ? ['040000'] : ['160000']).includes(file.mode)
        || (file.type === 'blob' && (!Number.isSafeInteger(file.size) || file.size < 0))) throw invalidResponse();
      if (file.type !== 'blob' || !['100644', '100755'].includes(file.mode) || file.size > MAX_SOURCE_BYTES) continue;
      try { assertCodePath(file.path); } catch { continue; }
      if (files.length === MAX_REPOSITORY_FILES) { truncated = true; continue; }
      files.push(Object.freeze({path:file.path, sha:file.sha, size:file.size}));
    }
    return Object.freeze({name, revision, url:`https://github.com/${name}`, files:Object.freeze(files), truncated});
  });
}

export async function loadRepositoryFile(repository, file, {fetchImpl = globalThis.fetch, signal} = {}) {
  const {owner, repo} = parseRepositoryUrl(repository?.url);
  if (!SHA.test(repository?.revision || '') || !Array.isArray(repository?.files) || repository.files.length > MAX_REPOSITORY_FILES
    || !file || !SHA.test(file.sha || '') || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_SOURCE_BYTES
    || !repository.files.some(item => item?.path === file.path && item.sha === file.sha && item.size === file.size)) {
    throw new Error('This file is not listed in the pinned repository or its identity changed. Reload the repository.');
  }
  assertCodePath(file.path);
  // Capture request ownership before awaiting; later UI selection changes cannot
  // change the file, commit, URL or validation used by this pending import.
  const {path, sha, size} = file, revision = repository.revision;
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  return withDeadline(signal, async requestSignal => {
    const blob = await githubJson(`${base}/git/blobs/${sha}`, MAX_BLOB_RESPONSE_BYTES, fetchImpl, requestSignal);
    if (blob?.sha !== sha || blob?.encoding !== 'base64' || !Number.isSafeInteger(blob.size) || blob.size < 0 || blob.size > MAX_SOURCE_BYTES
      || blob.size !== size || typeof blob.content !== 'string') throw new Error('GitHub returned an invalid blob identity or size. Files must be at most 64 KiB.');
    const encoded = blob.content.replace(/[\r\n]/g, '');
    if (encoded.length > Math.ceil(MAX_SOURCE_BYTES / 3) * 4 || encoded.length % 4 !== 0
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('GitHub returned invalid base64 source data or exceeded 64 KiB.');
    let binary;
    try { binary = atob(encoded); } catch { throw new Error('GitHub returned invalid base64 source data.'); }
    if (binary.length !== size || btoa(binary) !== encoded) throw new Error('GitHub returned invalid source bytes or size.');
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const url = `https://github.com/${owner}/${repo}/blob/${revision}/${path.split('/').map(encodeURIComponent).join('/')}`;
    return validateCodeSource({path, text:decodeUtf8(bytes), revision, source:'github', url});
  });
}
