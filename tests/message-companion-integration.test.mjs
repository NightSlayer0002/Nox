import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
const start=source.indexOf('async function exploreWithNox('),end=source.indexOf('\nfunction updateMemory()',start);
assert.ok(start>=0&&end>start);
function fixture({editing=false,draft='',busy=false,failVoice=false}={}){
  const calls=[],notices=[],input={value:draft,focus(){}};
  const context={busy,editTarget:editing?1:null,$:()=>input,toast:text=>notices.push(text),afterimageBridge:{stop(){}},voice:{stop(){},setEnabled(){}},showVoice(){},stage:{},mode:'companion',playReplyPreview:async packet=>{if(failVoice)throw Error('Voice failed');calls.push({kind:'read',packet});},send:async text=>calls.push({kind:'send',text})};
  return {context,input,calls,notices,run:vm.runInNewContext(`(${source.slice(start,end)})`,context)};
}

test('exploring a message never replaces an active earlier edit or clears an unsent draft',async()=>{
  for(const options of [{editing:true,draft:'My revised words'},{draft:'An unsent thought'}]){
    for(const kind of ['explain','quiz']){
      const f=fixture(options);await f.run({kind,text:'A selected passage.'});
      assert.equal(f.calls.length,0);assert.equal(f.input.value,options.draft);
      assert.equal(f.context.editTarget,options.editing?1:null);assert.ok(f.notices.length);
    }
  }
});

test('explicit exploration appends a bounded new prompt with the selected passage',async()=>{
  for(const kind of ['explain','quiz']){
    const f=fixture();await f.run({kind,text:'Important passage. '.repeat(1000)});
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].kind,'send');
    assert.ok(f.calls[0].text.includes('Passage:\nImportant passage.'));
    assert.ok(f.calls[0].text.length<6000);
  }
});

test('reading preserves editing and drafts, and reports unavailable voice without losing text',async()=>{
  const f=fixture({editing:true,draft:'My edit',failVoice:true});
  await f.run({kind:'read',text:'A passage to read.'});
  assert.equal(f.context.editTarget,1);assert.equal(f.input.value,'My edit');
  assert.equal(f.calls.length,0);assert.match(f.notices[0],/Voice failed/);
});

test('busy conversations cannot start competing exploration requests',async()=>{
  const f=fixture({busy:true});await f.run({kind:'explain',text:'A passage.'});
  assert.equal(f.calls.length,0);assert.ok(f.notices.length);
});
