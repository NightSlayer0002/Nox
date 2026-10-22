import test from 'node:test';
import assert from 'node:assert/strict';
import {historyNotice,historyFailure} from '../public/js/history-notice.js';
const history=options=>({persistent:true,recovery:null,capacity:{conversations:40,turns:200,conversationCount:2,turnCount:4},...options});
test('guest privacy is explicit beside conversation controls',()=>{
  assert.match(historyNotice(history({persistent:false}),{guest:true}).privacy,/This visit only.*refresh/);
});
test('protected archives take priority over a temporary fallback notice',()=>{
  const result=historyNotice(history({persistent:false,recovery:{reason:'unsupported'}}));
  assert.match(result.message,/newer|unsupported/i);assert.match(result.message,/untouched/);assert.equal(result.protected,true);
});
test('near-capacity notices explain limits without implying silent deletion',()=>{
  const result=historyNotice(history({capacity:{conversations:40,turns:200,conversationCount:39,turnCount:190}}));
  assert.match(result.message,/190.*200/);assert.match(result.message,/never.*automatically/i);
  assert.match(historyFailure(history({lastError:'turn-limit'})),/new conversation/i);
  assert.match(historyFailure(history({lastError:'conversation-limit'})),/40/);
});
test('storage failure does not promise that an in-memory answer was saved',()=>{
  const result=historyNotice(history({persistent:false}));assert.match(result.message,/not being saved/);assert.match(result.message,/Export/);
});
