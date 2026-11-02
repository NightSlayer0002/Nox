import test from 'node:test';
import assert from 'node:assert/strict';
import {createRehearsalSession} from '../public/js/rehearsal-session.js';
import {createHistory} from '../public/js/history.js';

// Question: does a persisted conversation remember that retry needs visit-only evidence?
// Limits: this marker does not persist private source or restore it after refresh.
test('history preserves source-required ownership through reload and revision',async()=>{
  const map=new Map(),storage={getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)};
  let history=await createHistory(storage);await history.append('user','Explain it',{requiresSource:true});await history.append('assistant','Answer');
  history=await createHistory(storage);assert.equal(history.active().turns[0].requiresSource,true);
  const target=history.revisionTarget(1,{role:'user'});await history.replaceFrom(target,'Explain another aspect');
  assert.equal(history.active().turns[0].requiresSource,true);assert.equal(history.active().turns[0].content,'Explain another aspect');
});

// Question: can a retry recover its original source and include a newer explicit correction?
// Limits: the UI must still validate this ticket before removing any saved reply.
test('recall binds retry to the original file, range and intent',()=>{
  const session=createRehearsalSession();session.open({path:'a.js',text:'original',revision:'1',source:'pasted'});
  const original=session.capture('explain');session.open({path:'b.js',text:'different',revision:'2',source:'pasted'});
  session.setCorrections('This is client code.');const retry=session.recall(original);
  assert.equal(retry.context.path,'a.js');assert.equal(retry.context.code,'original');assert.equal(retry.context.intent,'explain');
  assert.deepEqual(retry.context.corrections,['This is client code.']);assert.equal(session.complete(original,'stale'),false);
  assert.equal(session.complete(retry,'new answer','My own explanation'),true);
  assert.match(session.export(),/Your message:\nMy own explanation/);
});

// Question: can a user select an intact logical unit without losing exact source boundaries?
// Limits: NOX does not parse every language or infer whether a chosen range has all dependencies.
test('explicit ranges keep complete units intact and reject oversize changes before mutation',()=>{
  const session=createRehearsalSession();session.open({path:'long.js',text:Array.from({length:100},(_,i)=>`line ${i+1}`).join('\n'),revision:'1',source:'pasted'});
  session.selectRange(3,30);const ticket=session.capture('explain');
  assert.equal(ticket.context.code.split('\n').length,28);assert.equal(ticket.context.startLine,3);assert.equal(ticket.context.endLine,30);
  assert.throws(()=>session.selectRange(1,90),/80 lines/);assert.equal(session.context().startLine,3);
  session.next();session.recall(ticket);assert.equal(session.context().endLine,30);
});

// Question: can sequential sections account for every original line, including blanks?
// Limits: range coverage does not establish that a model explained those lines correctly.
test('rehearsal ranges retain exact lines and never advance themselves',()=>{
  const session=createRehearsalSession();
  session.open({path:'demo.js',text:Array.from({length:19},(_,i)=>i===2?'':`line ${i+1}`).join('\n'),source:'example',revision:'1'});
  assert.equal(session.context().code.split('\n')[2],'');
  assert.deepEqual([session.context().startLine,session.context().endLine],[1,8]);
  const ticket=session.capture('explain');session.complete(ticket,'Explanation');
  assert.equal(session.context().startLine,1);
  session.next();assert.equal(session.context().startLine,9);
  session.next();assert.deepEqual([session.context().startLine,session.context().endLine],[17,19]);
  assert.equal(session.next(),false);
});

// Question: can late replies mark a changed file/selection or a cancelled attempt as discussed?
// Limits: the conversation's durable save lock is tested separately.
test('only the current source selection accepts completion',()=>{
  const session=createRehearsalSession();
  const source={path:'a.js',text:'a\nb\nc\nd\ne\nf\ng\nh\ni',source:'pasted',revision:'local'};
  session.open(source);const ticket=session.capture('explain');session.next();
  assert.equal(session.complete(ticket,'old'),false);
  session.select(1);const changed=session.capture('explain');session.open({...source,text:'replacement'});
  assert.equal(session.complete(changed,'stale source'),false);
  assert.equal(session.snapshot().discussed,0);
});

// Question: are corrections, user confidence and generated responses separate facts?
// Limits: an explicit confidence mark is self-report, not demonstrated mastery.
test('preparation sheet separates discussed, self checked and corrections',()=>{
  const session=createRehearsalSession();session.open({path:'demo.js',text:'return 42;',source:'example',revision:'1'});
  session.setGoal('Explain my API');session.setCorrections('I wrote the route, not the database.');
  const ticket=session.capture('explain');assert.equal(ticket.context.corrections[0],'I wrote the route, not the database.');
  session.complete(ticket,'It returns 42.');assert.equal(session.snapshot().ready,0);
  session.markReady(true);assert.equal(session.snapshot().ready,1);
  const sheet=session.export();assert.match(sheet,/I wrote the route/);assert.match(sheet,/It returns 42/);assert.match(sheet,/Self-check/);
});

// Question: can an exported answer be matched to its submitted explanation and exact effective source instructions?
// Limits: chronological provenance preserves what was submitted; it does not establish that an AI reply is correct.
test('export binds each reply to its captured revision, range, goal and corrections in discussion order',()=>{
  const session=createRehearsalSession();
  session.open({path:'demo.js',text:'first source\nold second line',source:'pasted',revision:'draft-1'});session.selectRange(1,1);
  session.setGoal('Explain my browser code');session.setCorrections('This runs in the browser.');
  assert.equal(session.complete(session.capture('explain'),'First AI explanation.','My first explanation.'),true);
  session.open({path:'demo.js',text:'new first line\nsecond source',source:'github',revision:'commit-2'});session.selectRange(2,2);
  session.setGoal('Discuss the server revision');session.setCorrections('This revision runs on the server.\nI wrote this function.');
  assert.equal(session.complete(session.capture('question'),'Second AI question.','My revised explanation.'),true);
  session.setGoal('Unsent future goal');session.setCorrections('Unsent future correction.');

  const sheet=session.export(),first=sheet.split('Discussion 1\n')[1]?.split('Discussion 2\n')[0],second=sheet.split('Discussion 2\n')[1]?.split('Current draft for the next message')[0];
  assert.ok(first,'the first discussion must have its own provenance block');assert.ok(second,'the second discussion must have its own provenance block');
  assert.match(first,/demo\.js · lines 1–1 · explain\nSource: pasted · revision draft-1/);
  assert.match(first,/Goal at submission: Explain my browser code\nCorrections at submission:\n- This runs in the browser\./);
  assert.match(first,/Selected source:\nfirst source\n/);assert.match(first,/Your message:\nMy first explanation\./);assert.match(first,/NOX \(AI-generated; verify against your code\):\nFirst AI explanation\./);
  assert.doesNotMatch(first,/server revision|Unsent future|My revised explanation/);
  assert.match(second,/demo\.js · lines 2–2 · question\nSource: github · revision commit-2/);
  assert.match(second,/Goal at submission: Discuss the server revision\nCorrections at submission:\n- This revision runs on the server\.\n- I wrote this function\./);
  assert.match(second,/Selected source:\nsecond source\n/);assert.match(second,/Your message:\nMy revised explanation\./);assert.match(second,/Second AI question\./);
  assert.doesNotMatch(second,/browser code|Unsent future/);
  assert.match(sheet,/Current draft for the next message \(not applied to earlier replies\):\nGoal: Unsent future goal\nCorrections to preserve:\n- Unsent future correction\./);
  assert.ok(sheet.indexOf('Discussion 1\n')<sheet.indexOf('Discussion 2\n'));
});

// Question: does removing a correction leave an explicit empty submitted set instead of implying an older correction still applied?
// Limits: this checks exported context, not semantic compliance with the correction.
test('export represents an empty submitted goal and correction set explicitly',()=>{
  const session=createRehearsalSession();session.open({path:'demo.js',text:'source',source:'local',revision:'local'});
  session.setGoal('');session.setCorrections('');session.complete(session.capture('discuss'),'A reply.');
  assert.match(session.export(),/Goal at submission: \(none\)\nCorrections at submission:\n- None\./);
});

// Question: can switching files lose a prior file or turn an interview question into coverage?
// Limits: no refresh persistence is promised; the session lives only in this visit.
test('file state survives switching and questions do not mark explanation coverage',()=>{
  const session=createRehearsalSession();
  session.open({path:'a.js',text:'one\ntwo',source:'pasted',revision:'1'});
  const fileId=session.snapshot().file.id;session.complete(session.capture('question'),'What does one do?');
  assert.equal(session.snapshot().discussed,0);
  session.open({path:'b.js',text:'three',source:'pasted',revision:'1'});session.switchFile(fileId);
  assert.equal(session.context().path,'a.js');assert.equal(session.snapshot().records.length,1);
});

// Question: does a complete line-aligned narration count as discussed without claiming understanding?
// Limits: validated structure cannot establish explanation accuracy, audible playback or user learning.
test('validated narrated explanations count as discussion without marking self checks',()=>{
  const session=createRehearsalSession();session.open({path:'a.js',text:'one\ntwo\nthree\nfour',source:'pasted',revision:'1'});
  const answer='[L1] First line.\n[L2] Second line.\n[L3] Third line.\n[L4] Fourth line.';
  assert.equal(session.complete(session.capture('narrate'),answer,'Explain aloud'),true);
  assert.equal(session.snapshot().discussed,4);assert.equal(session.snapshot().ready,0);
  assert.match(session.export(),/Discussed: 4\/4 lines\. Self-check: 0\/4 lines\./);
});

// Question: can an incomplete narration inflate coverage while its written answer is retained?
// Limits: one invalid plan; parser tests cover other alignment and length failures.
test('an invalid narration is retained without marking missing lines as discussed',()=>{
  const session=createRehearsalSession();session.open({path:'a.js',text:'one\ntwo',source:'pasted',revision:'1'});
  assert.equal(session.complete(session.capture('narrate'),'[L1] Only one line.'),true);
  assert.equal(session.snapshot().discussed,0);assert.equal(session.snapshot().ready,0);
  assert.equal(session.snapshot().records[0].answer,'[L1] Only one line.');
});

// Question: can one very long or malformed source be silently shortened or exhaust the page?
// Limits: this is a bounded text viewer, not a parser for every programming language.
test('source and section limits reject without replacing existing work',()=>{
  const session=createRehearsalSession();session.open({path:'ok.js',text:'safe',source:'pasted',revision:'1'});
  assert.throws(()=>session.open({path:'bad.js',text:'x'.repeat(70000)}),/large/i);
  assert.equal(session.context().path,'ok.js');
  session.open({path:'long.js',text:'x'.repeat(6001),source:'pasted',revision:'1'});
  assert.throws(()=>session.capture('explain'),/line.*long/i);
});
