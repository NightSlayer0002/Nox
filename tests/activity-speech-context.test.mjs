import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createEverydayBridge} from '../public/js/everyday-bridge.js';
import {createAdaptivePreferences} from '../public/js/adaptive-preferences.js';
import {createVoice} from '../public/js/voice.js';
import {spokenPreview} from '../public/js/reply.js';

const source=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
const adapterSource=source.match(/EverydayBridge\.connect\(\{[\s\S]*?\n\}\);/)?.[0];
assert.ok(adapterSource,'the app exposes its everyday adapter boundary');

test('local Read aloud uses the activity pace without changing the active conversation scope',async()=>{
  const values=new Map(),approvedPreferences=createAdaptivePreferences({getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))});
  const learning=await approvedPreferences.approve(approvedPreferences.propose('Speak at 0.8x','learning'));
  await approvedPreferences.approve(approvedPreferences.propose('Speak at 1.2x','guessing'));
  const players=[],voice=createVoice({AudioContextCtor:null,urls:{createObjectURL:()=> 'blob:local-activity',revokeObjectURL(){}},requestAudio:async()=>new Blob(['fixture audio']),AudioCtor:class{
    constructor(){players.push(this);this.currentTime=0;this.paused=true;}
    play(){this.paused=false;this.onplaying?.();return Promise.resolve();}
    pause(){this.paused=true;}
  }});
  voice.configureNatural(true);voice.setEngine('natural');
  const bridge=createEverydayBridge(),context=vm.createContext({EverydayBridge:bridge,approvedPreferences,voice,spokenPreview,currentActivity:'conversation',mode:'companion',showVoice(){},stage:{speak(){}}});
  vm.runInContext(adapterSource,context);
  try{
    await bridge.speak('Look at the sunlit half.',{activity:'explore'});
    assert.equal(voice.pace,.8);assert.equal(players.at(-1).playbackRate,1.04*.8);
    assert.equal(context.currentActivity,'conversation');assert.deepEqual(approvedPreferences.context('conversation'),{});
    await bridge.speak('Ask a question about the object.',{activity:'guessing'});
    assert.equal(voice.pace,1.2);assert.equal(context.currentActivity,'conversation');
    await approvedPreferences.remove(learning.id);
    await bridge.speak('Look at the sunlit half.',{activity:'explore'});
    assert.equal(voice.pace,1);assert.equal(context.currentActivity,'conversation');
  }finally{voice.stop();}
});
