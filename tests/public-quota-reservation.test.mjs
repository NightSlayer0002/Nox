import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicQuota} from '../server/public-quota.mjs';
test('releasing shared capacity preserves the client throttle and is idempotent',()=>{
  const quota=createPublicQuota({now:()=>0,perClient:2,total:2});
  const first=quota.reserve('rejected');first.releaseShared();first.releaseShared();
  const second=quota.reserve('rejected');second.releaseShared();
  assert.equal(quota.take('rejected'),60);
  assert.equal(quota.take('legitimate'),0);assert.equal(quota.take('legitimate'),0);
  assert.equal(quota.take('another'),60);
});
test('a stale reservation cannot return capacity to a later minute',()=>{
  let time=0;const quota=createPublicQuota({now:()=>time,perClient:2,total:1});
  const stale=quota.reserve('old');time=60001;
  assert.equal(quota.take('current'),0);stale.releaseShared();
  assert.equal(quota.take('another'),60);
});
