import test from 'node:test';
import assert from 'node:assert/strict';
import {renderAnswer} from '../public/js/answer-content.js';
import {messageDocument,descendants} from './helpers/message-dom.mjs';
function render(text){const node=messageDocument().createElement('div');renderAnswer(node,text);return node;}

test('complete answers use paragraphs, bounded heading levels and genuine lists',()=>{
  const node=render('## A useful plan\n\nStart here.\n\n1. Read.\n2. Practice.\n\n- Rice\n- Salt');
  assert.equal(descendants(node,'h4')[0].textContent,'A useful plan');
  assert.equal(descendants(node,'p')[0].textContent,'Start here.');
  assert.deepEqual(descendants(node,'ol')[0].children.filter(n=>n.tagName==='LI').map(n=>n.textContent),['Read.','Practice.']);
  assert.deepEqual(descendants(node,'ul')[0].children.filter(n=>n.tagName==='LI').map(n=>n.textContent),['Rice','Salt']);
});
test('escaped prose breaks are decoded before semantic rendering',()=>{
  const node=render('**Plan**\\n1. Read.\\n2. Practice.');
  assert.equal(descendants(node,'strong')[0].textContent,'Plan');assert.equal(descendants(node,'li').length,2);
});
test('inline emphasis, inline code and valid links use text nodes',()=>{
  const node=render('**Keep** *this* `a\\nb` and [documentation](https://example.com/docs).');
  assert.equal(descendants(node,'strong')[0].textContent,'Keep');assert.equal(descendants(node,'em')[0].textContent,'this');
  assert.equal(descendants(node,'code')[0].textContent,'a\\nb');
  const link=descendants(node,'a')[0];assert.equal(link.getAttribute('href'),'https://example.com/docs');
  assert.equal(link.getAttribute('rel'),'noopener noreferrer');
});
test('unsafe links, raw HTML and markdown images never become executable elements',()=>{
  const input='<img src=x onerror=alert(1)> [bad](javascript:alert) ![pixel](https://example.com/pixel) <script>bad()</script>';
  const node=render(input);assert.equal(node.textContent,input);assert.equal(descendants(node,'a').length,0);assert.equal(descendants(node,'img').length,0);assert.equal(descendants(node,'script').length,0);
});
test('fenced source and literal paths stay intact instead of becoming prose',()=>{
  const code='const value = "\\n1. raw **text**";\nconsole.log(value);';
  const node=render('```js\n'+code+'\n```\n\nC:\\new\\__notes__\\name.txt and "**literal**"');
  assert.equal(descendants(node,'pre')[0].textContent,code);assert.equal(descendants(node,'strong').length,0);
  assert.ok(node.textContent.includes('C:\\new\\__notes__\\name.txt and "**literal**"'));
});
test('unclosed code fences and list starting numbers remain readable',()=>{
  assert.equal(descendants(render('```\n<strong>raw</strong>'),'code')[0].textContent,'<strong>raw</strong>');
  assert.equal(descendants(render('4. Continue\n5. Finish'),'ol')[0].getAttribute('start'),'4');
});
test('arithmetic, identifiers and quoted source are not emphasis',()=>{
  for(const text of ['2 * 3 * 4 equals 24.','2 ** 3 equals 8.','file_name and user_id','"**literal**"']){
    const node=render(text);assert.equal(node.textContent,text);assert.equal(descendants(node,'em').length,0);assert.equal(descendants(node,'strong').length,0);
  }
});
test('list boundaries survive textContent consumers such as Explain and Read aloud',()=>{
  assert.equal(render('- sodium\n- chloride').textContent,'sodium\nchloride');
});
