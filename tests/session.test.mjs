import test from 'node:test';
import assert from 'node:assert/strict';
import { mintSession, validSession, createUnlockThrottle } from '../server/session.mjs';

test('owner sessions expire and cannot transfer across hosts, keys or altered signatures',()=>{
  const now=100000,session=mintSession('private-test','nox.example',now);
  assert.ok(validSession(session,'private-test','nox.example',now+100));
  assert.equal(validSession(session,'other-key','nox.example',now),false);
  assert.equal(validSession(session,'private-test','elsewhere.example',now),false);
  assert.equal(validSession(session+'x','private-test','nox.example',now),false);
  assert.equal(validSession(session,'private-test','nox.example',now+12*60*60*1000),false);
  assert.equal(validSession('','private-test','nox.example',now),false);
});

test('unlock failures isolate IPs, expire, and evict old buckets at the bounded capacity',()=>{
  let time=1000;
  const guard=createUnlockThrottle({now:()=>time,maxEntries:2,maxFailures:2,windowMs:5000});
  guard.fail('one');guard.fail('one');
  assert.equal(guard.retryAfter('one'),5);
  assert.equal(guard.retryAfter('two'),0);
  guard.fail('two');guard.fail('two');
  guard.fail('three');guard.fail('three');
  assert.equal(guard.retryAfter('one'),0);
  assert.equal(guard.retryAfter('two'),5);
  assert.equal(guard.retryAfter('three'),5);
  time+=5001;
  assert.equal(guard.retryAfter('two'),0);
  assert.equal(guard.retryAfter('three'),0);
});
