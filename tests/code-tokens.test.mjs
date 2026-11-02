import test from 'node:test';
import assert from 'node:assert/strict';
import {tokenizeSource} from '../public/js/code-tokens.js';
const restore=lines=>lines.map(line=>line.map(token=>token.text).join('')).join('\n');

// Question: can syntax hints preserve every source character, line and Unicode sequence?
// Limits: lexical colour categories do not parse or validate a programming language.
test('syntax tokens preserve exact Unicode source and trailing blank lines',()=>{
  const text='export const π = "नमस्ते 👋";\n\nreturn total(π, 2.5);\n';
  const lines=tokenizeSource(text,'src/main.ts');assert.equal(restore(lines),text);
  const tokens=lines.flat();assert.ok(tokens.some(t=>t.kind==='keyword'&&t.text==='export'));
  assert.ok(tokens.some(t=>t.kind==='string'&&t.text==='"नमस्ते 👋"'));
  assert.ok(tokens.some(t=>t.kind==='call'&&t.text==='total'));
  assert.ok(tokens.some(t=>t.kind==='number'&&t.text==='2.5'));
});

// Question: can comment/string state cross lines without colouring their contents as executable keywords?
// Limits: template interpolation and nested language grammars are intentionally not interpreted.
test('multiline comments and template strings retain lexical state',()=>{
  const text='/* first\nreturn 42; */ const value = `a\n// not a comment`; // actual comment';
  const lines=tokenizeSource(text,'a.js');assert.equal(restore(lines),text);
  assert.equal(lines[1][0].kind,'comment');assert.match(lines[1][0].text,/return 42/);
  assert.equal(lines[2][0].kind,'string');assert.ok(lines[2].some(t=>t.kind==='comment'&&t.text==='// actual comment'));
});

// Question: can an unfinished one-line quote incorrectly colour the next line as string content?
// Limits: malformed source remains displayable; no diagnosis or repair of its syntax is provided.
test('a one-line quote ending at the newline cannot consume the following statement',()=>{
  const text="const value = '\nreturn total();",lines=tokenizeSource(text,'a.js');
  assert.equal(restore(lines),text);assert.equal(lines[1][0].kind,'keyword');
});

// Question: do escaped quotes and Python triple strings keep source and comment boundaries intact?
// Limits: this is a bounded reading aid, not a Python interpreter or syntax checker.
test('Python strings and comments retain their distinct boundaries',()=>{
  const text='def greet():\n  text = """hello\n# still a string"""\n  return "say \\"hi\\"" # comment';
  const lines=tokenizeSource(text,'a.py');assert.equal(restore(lines),text);
  assert.equal(lines[0][0].kind,'keyword');assert.equal(lines[2][0].kind,'string');
  assert.equal(lines[3].at(-1).kind,'comment');
});

// Question: can Rust-like source receive useful hints without executing or rewriting it?
// Limits: macro expansion, lifetime grammar and correctness are not established.
test('Rust-like keywords and literal numbers are readable while text remains exact',()=>{
  const text='pub fn total(items: &[u32]) -> u32 {\n  let mut value = 0xFF; // seed\n  value\n}';
  const lines=tokenizeSource(text,'src/lib.rs');assert.equal(restore(lines),text);
  assert.ok(lines.flat().some(t=>t.kind==='keyword'&&t.text==='fn'));
  assert.ok(lines.flat().some(t=>t.kind==='number'&&t.text==='0xFF'));
});

// Question: can unsupported markup or prompt-looking input alter the source rather than remaining plain text?
// Limits: DOM inertness is checked in Chromium; this test establishes only exact token data.
test('unsupported formats remain literal plain text including markup',()=>{
  const text='<script>window.codeExecuted=true</script>\n<img src=x onerror=alert(1)>';
  const lines=tokenizeSource(text,'example.html');assert.equal(restore(lines),text);
  assert.ok(lines.flat().every(t=>t.kind==='plain'));
});

// Question: can colouring create unbounded token/DOM work for dense or oversized input?
// Limits: fallback bounds hint generation; it is not a frame-rate benchmark on physical devices.
test('large or token-dense sources fall back to exact plain lines',()=>{
  for(const text of ['x'.repeat(65537),'const x=1;'.repeat(3000)]){
    const lines=tokenizeSource(text,'dense.js');assert.equal(restore(lines),text);assert.ok(lines.flat().every(t=>t.kind==='plain'));
  }
});
