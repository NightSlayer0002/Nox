import test from 'node:test';
import assert from 'node:assert/strict';
import {createProviderControls} from '../public/js/provider-controls.js';
class Select extends EventTarget{constructor(){super();this.options=[];this.value='';}replaceChildren(...options){this.options=options;}}
const optionFactory=()=>({});
test('composer and preferences share the same provider selection and disabled choices',()=>{
  const a=new Select(),b=new Select(),changes=[];
  const controls=createProviderControls([a,b],value=>changes.push(value),optionFactory);
  controls.update([{id:'groq',name:'Groq',model:'openai/gpt-oss-20b'},{id:'gemini',name:'Gemini'},{id:'nvidia',name:'NVIDIA · To be connected',disabled:true}],'groq');
  assert.equal(a.value,b.value);assert.equal(a.options[2].disabled,true);assert.notEqual(a.options[0],b.options[0]);
  b.value='gemini';b.dispatchEvent(new Event('change'));assert.deepEqual(changes,['gemini']);assert.equal(a.value,'gemini');
  a.value='nvidia';a.dispatchEvent(new Event('change'));assert.equal(a.value,'gemini');assert.equal(changes.length,1);
  controls.dispose();
});
test('provider refresh replaces stale options and listeners are removed on disposal',()=>{
  const select=new Select(),changes=[],controls=createProviderControls([select],value=>changes.push(value),optionFactory);
  controls.update([{id:'old',name:'Old'}],'old');controls.update([{id:'new',name:'New'}],'new');
  assert.equal(select.options.length,1);assert.equal(select.options[0].value,'new');
  controls.dispose();select.dispatchEvent(new Event('change'));assert.deepEqual(changes,[]);
});
