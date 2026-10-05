import test from 'node:test';
import assert from 'node:assert/strict';
import { mintSession, validSession } from '../server/session.mjs';

test('owner sessions expire and cannot transfer across hosts, keys or altered signatures',()=>{
  const now=100000,session=mintSession('private-test','nox.example',now);
  assert.ok(validSession(session,'private-test','nox.example',now+100));
  assert.equal(validSession(session,'other-key','nox.example',now),false);
  assert.equal(validSession(session,'private-test','elsewhere.example',now),false);
  assert.equal(validSession(session+'x','private-test','nox.example',now),false);
  assert.equal(validSession(session,'private-test','nox.example',now+12*60*60*1000),false);
  assert.equal(validSession('','private-test','nox.example',now),false);
});
