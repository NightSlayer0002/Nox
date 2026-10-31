import test from 'node:test';
import assert from 'node:assert/strict';
import {createRehearsalSession} from '../public/js/rehearsal-session.js';

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

// Question: can one very long or malformed source be silently shortened or exhaust the page?
// Limits: this is a bounded text viewer, not a parser for every programming language.
test('source and section limits reject without replacing existing work',()=>{
  const session=createRehearsalSession();session.open({path:'ok.js',text:'safe',source:'pasted',revision:'1'});
  assert.throws(()=>session.open({path:'bad.js',text:'x'.repeat(70000)}),/large/i);
  assert.equal(session.context().path,'ok.js');
  session.open({path:'long.js',text:'x'.repeat(6001),source:'pasted',revision:'1'});
  assert.throws(()=>session.capture('explain'),/line.*long/i);
});
