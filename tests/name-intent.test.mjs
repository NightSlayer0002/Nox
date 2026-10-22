import test from 'node:test';
import assert from 'node:assert/strict';
import {selfDeclaredName} from '../public/js/name-intent.js';
test('standalone first-person identity can set a name',()=>{
  assert.equal(selfDeclaredName('My name is Abhijay.'),'Abhijay');assert.equal(selfDeclaredName('Please call me Maya Chen'),'Maya Chen');assert.equal(selfDeclaredName('NOX, call me Zoë'),'Zoë');
});
test('quoted, hypothetical, negative or third-person names do not personalize NOX',()=>{
  for(const text of ['Explain “Call me Ishmael”','A character says my name is Ava','Do not call me Ava','My name is not Ava','If I say my name is Ava, what would you say?','"My name is Ava"','Call me Ava, but only in the story'])assert.equal(selfDeclaredName(text),'',text);
});
