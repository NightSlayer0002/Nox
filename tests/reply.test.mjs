import test from 'node:test';
import assert from 'node:assert/strict';
import { spokenPreview, playReplyPreview } from '../public/js/reply.js';
import { createVoice } from '../public/js/voice.js';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { readChatStream } from '../public/js/stream.js';
test('speech preview finishes at a sentence without losing the written reply',()=>{
  const text='A useful answer. '+ 'A much longer explanation follows. '.repeat(80);
  const spoken=spokenPreview(text);
  assert.ok(spoken.length<=420);assert.ok(spoken.endsWith('.'));assert.ok(text.length>spoken.length);
  assert.equal(spokenPreview('Hi.\nNice to meet you.'),'Hi. Nice to meet you.');
});
test('client stream preserves a deep reply beyond the old character cap',async()=>{
  const speech='Detailed thought. '.repeat(200),packet={speech,emotion:'curious',action:'none',memory:''};let shown='';
  const response=new Response(`event: text\ndata: ${JSON.stringify({speech})}\n\nevent: final\ndata: ${JSON.stringify(packet)}\n\n`,{headers:{'content-type':'text/event-stream'}});
  const result=await readChatStream(response,text=>shown=text);assert.equal(shown,speech);assert.equal(result.speech,speech);
});

// Each case asks whether this text keeps complete characters within the wire
// limit. Exact strings resolve truncation; they cannot prove pronunciation,
// provider acceptance, intelligibility or quality in every language.
for(const [name,text,want] of [
  ['unspaced CJK','漢'.repeat(500),'漢'.repeat(419)+'…'],
  ['a long identifier','x'.repeat(500),'x'.repeat(419)+'…'],
  ['joined emoji','👩🏽‍🚀'.repeat(80),'👩🏽‍🚀'.repeat(59)+'…'],
  ['combining marks','e\u0301'.repeat(300),'e\u0301'.repeat(209)+'…'],
  ['a cluster crossing the ceiling','x'.repeat(418)+'👩🏽‍🚀'.repeat(3),'x'.repeat(418)+'…'],
  ['CJK sentence punctuation','漢'.repeat(150)+'。'+'字'.repeat(400),'漢'.repeat(150)+'。'],
  ['a complete sentence at the ceiling','漢'.repeat(419)+'。'+'字'.repeat(10),'漢'.repeat(419)+'。'],
  ['English word boundaries','word '.repeat(100),'word '.repeat(83)+'word…'],
])test(`speech preview preserves ${name} within its UTF-16 transport ceiling`,()=>{
  const spoken=spokenPreview(text);
  assert.equal(spoken,want);
  assert.ok(spoken.length<=420);
});

// Resolves passage-to-adapter wiring with a stub player, not audible playback.
test('Read aloud passes a useful grapheme-safe opening to the actual voice adapter',async()=>{
  const source=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
  const action=source.match(/async function exploreWithNox\(\{kind,text\}\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(action);
  const requested=[],captions=[],voice=createVoice({
    requestAudio:async text=>{requested.push(text);return new Blob(['fixture'],{type:'audio/mpeg'});},
    AudioCtor:class{play(){return Promise.resolve();}pause(){}},AudioContextCtor:null,
    urls:{createObjectURL:()=>'',revokeObjectURL(){}},
  });
  voice.configureNatural(true);voice.setEngine('natural');
  const context=vm.createContext({busy:false,afterimageBridge:{stop(){}},voice,showVoice(){},toast(){},playReplyPreview,stage:{speak:packet=>captions.push(packet.speech)},mode:'companion'});
  vm.runInContext(action,context);
  try{
    await context.exploreWithNox({kind:'read',text:'漢'.repeat(500)});
    assert.deepEqual(requested,['漢'.repeat(419)+'…']);
    assert.deepEqual(captions,requested);
  }finally{voice.stop();}
});

// Resolves safe fallback for these strings, not full Unicode segmentation.
test('speech preview remains cluster-safe when native segmentation is unavailable',()=>{
  const previous=Intl.Segmenter;
  try{
    Intl.Segmenter=undefined;
    const spoken=spokenPreview('👩🏽‍🚀'.repeat(80));
    assert.ok(spoken.length<=420);
    assert.equal(spoken.replace(/…$/u,'').split('👩🏽‍🚀').join(''),'');
    assert.equal(spokenPreview('x'.repeat(500)),'x'.repeat(419)+'…');
  }finally{Intl.Segmenter=previous;}
});
