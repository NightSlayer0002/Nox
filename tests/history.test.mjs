import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../public/js/history.js';
const storage=()=>{const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)};};
test('deep answers keep their text and paragraphs after save, export and reload',async()=>{
  const disk=storage(),history=await createHistory(disk),text='First paragraph.\n\n'+ 'A detailed explanation. '.repeat(230)+'\nFinal conclusion.';
  await history.append('assistant',text);
  assert.equal(history.active().turns[0].content,text);
  assert.equal((await createHistory(disk)).active().turns[0].content,text);
  assert.equal(JSON.parse(history.export()).threads[0].turns[0].content,text);
});
test('threads restore independently and search message content',async()=>{
  const disk=storage(), history=await createHistory(disk);
  const first=history.active().id;await history.append('user','My blue lighthouse');await history.append('assistant','Keep the light.');
  const second=(await history.create()).id;await history.append('user','A different room');
  await history.select(first);assert.equal(history.active().turns.length,2);assert.equal(history.list('lighthouse')[0].id,first);
  const restored=await createHistory(disk);assert.equal(restored.active().id,first);assert.equal(restored.list().length,2);
  await restored.remove(first);assert.equal(restored.active().id,second);assert.doesNotMatch(restored.export(),/lighthouse/);
});
test('summary context is bounded without discarding the archived transcript',async()=>{
  const history=await createHistory(storage());for(let i=0;i<20;i++)await history.append(i%2?'assistant':'user',`turn ${i}`);
  const work=history.summaryWork();assert.equal(work.turns.length,12);
  assert.equal(await history.applySummary(work.id,work.through,'We discussed a lighthouse.'),true);
  assert.equal(history.context().summary,'We discussed a lighthouse.');assert.equal(history.context().history.length,8);
  assert.equal(history.active().turns.length,20);assert.equal(history.summaryWork(),null);
  await history.remove(work.id);assert.equal(await history.applySummary(work.id,work.through,'stale'),false);
});
test('corrupt or unavailable storage preserves a usable visit and data remains bounded',async()=>{
  const history=await createHistory({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});
  await history.append('system','untrusted');assert.equal(history.active().turns.length,0);
  for(let i=0;i<230;i++)await history.append('user',`message ${i}`);
  assert.equal(history.active().turns.length,200);assert.ok(history.context().history.length<=8);assert.equal(history.persistent,false);
  for(let i=0;i<45;i++){await history.create();await history.append('user','next thread '+i);}assert.equal(history.list().length,40);
});

test('a Unicode summary batch fits the HTTP budget and advances through only included turns',async()=>{
  const history=await createHistory(storage());for(let i=0;i<40;i++)await history.append(i%2?'assistant':'user','🌙'.repeat(600));
  const work=history.summaryWork();assert.ok(new TextEncoder().encode(JSON.stringify(work)).byteLength<16384);assert.equal(work.through,work.turns.length);assert.ok(work.turns.length<24);
});

test('context preserves early unsummarized turns and supplies a bounded bridge if summarization is delayed',async()=>{
  const history=await createHistory(storage());for(let i=0;i<10;i++)await history.append(i%2?'assistant':'user',i?'later turn '+i:'Project name: Moonroom');
  assert.match(JSON.stringify(history.context()),/Moonroom/);assert.equal(history.summaryWork(),null);
  for(let i=10;i<30;i++)await history.append(i%2?'assistant':'user','later turn '+i);
  assert.match(history.context().bridge,/Moonroom/);assert.ok(history.context().bridge.length<=1600);assert.ok(history.context().history.length<=12);
});

test('stale tabs serialize writes, preserve both threads, and cannot resurrect a deleted thread',async()=>{
  const disk=storage(),a=await createHistory(disk),b=await createHistory(disk),stale=await createHistory(disk);const first=a.active().id;
  await Promise.all([a.append('user','Important original message'),b.create()]);await b.append('user','Second thread');
  const restored=await createHistory(disk);assert.equal(restored.list().length,2);assert.match(restored.export(),/Important original message/);
  await a.remove(first);await b.setMode('director');assert.equal(await stale.append('user','Resurrected message'),false);const final=await createHistory(disk);assert.doesNotMatch(final.export(),/Important original message|Resurrected message/);
});
