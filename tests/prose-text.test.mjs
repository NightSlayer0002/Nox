import test from 'node:test';
import assert from 'node:assert/strict';
import {proseText} from '../public/js/prose-text.js';
test('post-JSON escaped plan line breaks and prose Markdown become readable plain text',()=>{const decoded=JSON.parse('{"speech":"**Plan**\\\\n1. Read for 20 minutes.\\\\n2. Practice for 30 minutes.\\\\n3. Review for 35 minutes.\\\\n4. Buffer for 5 minutes."}').speech;assert.equal(proseText(decoded),'Plan\n1. Read for 20 minutes.\n2. Practice for 30 minutes.\n3. Review for 35 minutes.\n4. Buffer for 5 minutes.');});
test('real newlines, headings, emphasis and list bullets render consistently',()=>{assert.equal(proseText('## Ingredients\n- **Rice**\n- *Salt*\n\nCook _gently_.'),'Ingredients\n• Rice\n• Salt\n\nCook gently.');});
test('code, Windows and network paths and literal newline explanations remain exact',()=>{for(const text of ['Use `String.raw` with `a\\nb`.','```js\nconst pattern = "\\n";\nconst value = "**bold**";\n```','C:\\new\\notes\\name.txt','\\\\nas\\new\\notes','The escape sequence \\n means a newline.','file_name and user_id remain identifiers.','2 ** 3 equals 8.'])assert.equal(proseText(text),text,text);});
test('markup stays literal and formatting does not execute or manufacture HTML',()=>{const text='<img src=x onerror=alert(1)> **safe** & <script>bad()</script>';assert.equal(proseText(text),'<img src=x onerror=alert(1)> safe & <script>bad()</script>');});

test('quoted source strings, indented code and POSIX paths are not treated as prose markup',()=>{for(const text of ['const value = "\\n1. keep this escape";','    const value = "**literal**";\n    const next = "\\n1. raw";','/tmp/__nox__/first_file.txt'])assert.equal(proseText(text),text);});
