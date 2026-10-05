import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionState } from '../public/js/connection.js';

test('a locked or unavailable connection cannot silently become scripted chat',()=>{
  assert.equal(connectionState({},'').kind,'loading');
  assert.equal(connectionState({access:'locked',brain:'demo',providers:[]},'').kind,'locked');
  assert.equal(connectionState({access:'open',brain:'demo',providers:[]},'').kind,'unconfigured');
  assert.equal(connectionState({access:'open',brain:'demo',providers:[]},'demo').kind,'demo');
  const live=connectionState({access:'open',brain:'live',provider:'groq',providers:[{id:'groq',name:'GroqCloud'}]},'');
  assert.equal(live.kind,'live');assert.equal(live.provider.id,'groq');
});
