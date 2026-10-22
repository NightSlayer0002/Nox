import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistory} from '../public/js/history.js';
const KEY='nox.chats.v1';
const disk=initial=>{const values=new Map(initial===undefined?[]:[[KEY,initial]]);return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};

for(const [reason,raw] of [['invalid','{broken archive'],['unsupported',' {"version":99,"threads":[{"valuable":"original"}]} '],['invalid','{"version":1,"threads":"unexpected"}']]){
  test(`${reason} archives remain byte-for-byte intact during initialization and temporary chat writes`,async()=>{
    const storage=disk(raw),history=await createHistory(storage);
    assert.equal(storage.getItem(KEY),raw);
    assert.equal(history.recovery.reason,reason);assert.equal(history.exportOriginal(),raw);assert.equal(history.persistent,false);
    await history.append('user','A usable temporary chat');await history.setMode('director');await history.create();
    assert.equal(storage.getItem(KEY),raw);assert.match(history.export(),/A usable temporary chat/);
  });
}

test('a newer archive arriving before a write cannot be overwritten by an older tab',async()=>{
  const storage=disk(),history=await createHistory(storage);await history.append('user','Original local turn');
  const newer='{"version":2,"valuable":"external update"}';storage.setItem(KEY,newer);
  await history.setMode('uncanny');await history.append('user','Temporary turn');
  assert.equal(storage.getItem(KEY),newer);assert.equal(history.exportOriginal(),newer);
  assert.match(history.export(),/Temporary turn/);
});

test('explicit archive reset succeeds only while the protected original is unchanged',async()=>{
  const raw='{broken',storage=disk(raw),history=await createHistory(storage);
  const other='{"version":99,"valuable":"new changes"}';storage.setItem(KEY,other);
  assert.equal(await history.resetArchive(),false);assert.equal(storage.getItem(KEY),other);
  assert.equal(history.exportOriginal(),other);
  assert.equal(await history.resetArchive(),true);assert.equal(history.recovery,null);
  assert.equal(JSON.parse(storage.getItem(KEY)).version,1);assert.equal(history.active().turns.length,0);
});

test('conversation capacity refuses a new thread without evicting any existing conversation',async()=>{
  const storage=disk(),history=await createHistory(storage),ids=[];
  for(let i=0;i<40;i++){if(i)assert.ok(await history.create());ids.push(history.active().id);await history.append('user',`Retained conversation ${i}`);}
  const before=storage.getItem(KEY);
  assert.equal(await history.create(),null);assert.equal(history.lastError,'conversation-limit');
  assert.equal(history.list().length,40);assert.equal(storage.getItem(KEY),before);
  for(const id of ids)assert.ok(history.list().some(t=>t.id===id));
});

test('a recovered archive from another tab cannot replace temporary work and is merged only after fresh confirmation',async()=>{
  const storage=disk('{broken'),history=await createHistory(storage);
  await history.append('user','My temporary work');
  const source=disk(),other=await createHistory(source);await other.append('user','Recovered elsewhere');
  const recovered=source.getItem(KEY);storage.setItem(KEY,recovered);
  assert.equal(await history.resetArchive(),false);assert.equal(history.recovery.reason,'changed');
  assert.equal(storage.getItem(KEY),recovered);assert.match(history.export(),/My temporary work/);
  assert.equal(await history.resetArchive(),true);assert.equal(history.recovery,null);
  assert.match(history.export(),/Recovered elsewhere/);
  assert.match(storage.getItem(KEY),/My temporary work/);assert.match(storage.getItem(KEY),/Recovered elsewhere/);
});

test('noncanonical IDs cannot be truncated into a duplicate archive during an ordinary write',async()=>{
  const threads=['a','b'].map(suffix=>({id:'x'.repeat(60)+suffix,title:suffix,turns:[]}));
  const raw=JSON.stringify({version:1,threads}),storage=disk(raw),history=await createHistory(storage);
  await history.setMode('director');assert.equal(storage.getItem(KEY),raw);assert.ok(history.recovery);
});

test('explicit replacement retains the work composed while the original archive was protected',async()=>{
  const storage=disk('{broken'),history=await createHistory(storage);
  await history.append('user','Keep my temporary question');await history.append('assistant','Keep this reply too');
  assert.equal(await history.resetArchive(),true);
  assert.equal((await createHistory(storage)).active().turns.length,2);
  assert.match(storage.getItem(KEY),/Keep this reply too/);
});

test('turn capacity reserves room for the final answer and preserves the complete transcript',async()=>{
  const storage=disk(),history=await createHistory(storage);
  for(let i=0;i<100;i++){assert.equal(await history.append('user',`Question ${i}`),true);assert.equal(await history.append('assistant',`Complete answer ${i}`),true);}
  const before=storage.getItem(KEY);
  assert.equal(await history.append('user','Would silently evict Question 0'),false);
  assert.equal(history.lastError,'turn-limit');assert.equal(history.active().turns.length,200);
  assert.equal(history.active().turns[0].content,'Question 0');assert.equal(storage.getItem(KEY),before);
});

test('loading an older oversized archive does not prune its conversations or messages',async()=>{
  const threads=Array.from({length:42},(_,i)=>({id:`old-${i}`,title:`Old ${i}`,turns:Array.from({length:202},(_,j)=>({role:j%2?'assistant':'user',content:`Original ${i}/${j}`,seq:j+1}))}));
  const storage=disk(JSON.stringify({version:1,active:'old-0',threads})),history=await createHistory(storage);
  assert.equal(history.list().length,42);assert.equal(history.active().turns.length,202);
  await history.setMode('director');assert.equal(JSON.parse(storage.getItem(KEY)).threads[0].turns.length,202);
});

test('quota failure keeps the newly generated reply in this visit without replacing saved bytes',async()=>{
  const storage=disk(),history=await createHistory(storage);await history.append('user','Saved question');
  const saved=storage.getItem(KEY);storage.setItem=()=>{throw Object.assign(Error('full'),{name:'QuotaExceededError'});};
  assert.equal(await history.append('assistant','Unsaved but recoverable answer'),true);
  await history.setMode('director');assert.equal(storage.getItem(KEY),saved);
  assert.equal(history.persistent,false);assert.match(history.export(),/Unsaved but recoverable answer/);
});
