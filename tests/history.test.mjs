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

test('full input and output budgets survive private history reload and editing',async()=>{
  const disk=storage(),history=await createHistory(disk),user='U'.repeat(6000),reply='A'.repeat(12000);
  await history.append('user',user);await history.append('assistant',reply);
  const restored=await createHistory(disk);assert.equal(restored.active().turns[0].content,user);assert.equal(restored.active().turns[1].content,reply);
  const edit=await restored.replaceFrom(1,user);assert.equal(edit.draft,user);assert.equal(edit.thread.turns.length,1);
});

test('editing an earlier user turn drops downstream replies and stale summary before the next reply',async()=>{
  const history=await createHistory(storage());for(let index=0;index<20;index++)await history.append(index%2?'assistant':'user',`Turn ${index}`);
  const work=history.summaryWork();await history.applySummary(work.id,work.through,'A summary referring to old downstream details');
  const edit=await history.replaceFrom(9,'My corrected question\nwith its context');
  assert.equal(edit.seq,9);assert.equal(edit.draft,'My corrected question\nwith its context');assert.equal(edit.thread.turns.length,9);
  assert.equal(history.active().turns.at(-1).role,'user');assert.equal(history.active().turns.at(-1).content,edit.draft);
  assert.equal(history.active().summary,'');assert.equal(history.active().summaryThrough,0);assert.equal(history.active().next,10);assert.equal(history.context().summary,'');
  await history.append('assistant','A newly grounded reply');assert.equal(history.active().turns.at(-1).seq,10);assert.equal(history.active().turns.length,10);
  const before=history.active();assert.equal(await history.replaceFrom(10,'Cannot edit an assistant as a user'),null);assert.equal(await history.replaceFrom(9,'U'.repeat(6001)),null);assert.deepEqual(history.active(),before);
});

test('retrying an assistant turn keeps exactly its preceding user prompt without duplicating it',async()=>{
  const history=await createHistory(storage());
  await history.append('user','First question');await history.append('assistant','First reply');await history.append('user','Retry this question');await history.append('assistant','Old reply');await history.append('user','Downstream question');await history.append('assistant','Downstream reply');
  await history.applySummary(history.active().id,2,'A summary to invalidate');
  const retry=await history.retryFrom(4);
  assert.equal(retry.seq,3);assert.equal(retry.draft,'Retry this question');assert.deepEqual(history.active().turns.map(turn=>turn.content),['First question','First reply','Retry this question']);
  assert.equal(history.active().turns.filter(turn=>turn.content===retry.draft).length,1);assert.equal(history.active().next,4);assert.equal(history.active().summary,'');assert.equal(history.active().summaryThrough,0);
  await history.append('assistant','Replacement reply');assert.deepEqual(history.active().turns.map(turn=>turn.seq),[1,2,3,4]);
  const before=history.active();assert.equal(await history.retryFrom(999),null);assert.deepEqual(history.active(),before);
});
