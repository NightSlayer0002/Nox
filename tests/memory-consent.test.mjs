import test from 'node:test';
import assert from 'node:assert/strict';
import {demoReply} from '../public/js/brain.js';
test('the explicit demo never saves refused or quoted memory requests',()=>{
  for(const message of ['Do not remember that my launch code is 1234','“remember that I like red” is an example','What did I ask you to remember that last time?'])assert.equal(demoReply(message).memory,'');
  assert.equal(demoReply('Remember that I like blue').memory,'I like blue');
});
