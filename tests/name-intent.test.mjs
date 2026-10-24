import test from 'node:test';
import assert from 'node:assert/strict';
import {selfDeclaredName} from '../public/js/name-intent.js';
test('standalone first-person identity can set a name',()=>{
  assert.equal(selfDeclaredName('My name is Abhijay.'),'Abhijay');assert.equal(selfDeclaredName('Please call me Maya Chen'),'Maya Chen');assert.equal(selfDeclaredName('NOX, call me Zoë'),'Zoë');
});
test('quoted, hypothetical, negative or third-person names do not personalize NOX',()=>{
  for(const text of ['Explain “Call me Ishmael”','A character says my name is Ava','Do not call me Ava','My name is not Ava','If I say my name is Ava, what would you say?','"My name is Ava"','Call me Ava, but only in the story'])assert.equal(selfDeclaredName(text),'',text);
});

test('call me callback and scheduling phrases do not overwrite identity',()=>{
  for(const text of ['Call me later.','Call me back.','Call me tomorrow','Call me when ready.','Please call me tonight','NOX, call me in five minutes','Call me next week','Call me at noon','Call me on Monday','"Call me Maya"'])assert.equal(selfDeclaredName(text),'',text);
  assert.equal(selfDeclaredName('My name is Later'),'Later');assert.equal(selfDeclaredName('Call me Maya Chen'),'Maya Chen');
});

test('callback rejection uses whole words rather than rejecting name prefixes',()=>{for(const name of ['Backman','Nowak','Soonja','Laterza'])assert.equal(selfDeclaredName(`Call me ${name}`),name);});
