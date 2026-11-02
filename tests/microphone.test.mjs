import test from 'node:test';
import assert from 'node:assert/strict';
import {createMicrophone} from '../public/js/voice.js';
import {createVoiceCall} from '../public/js/voice-call.js';

function fixture(t,{onText,onState,onError,failStart=false}={}){
  const previous=globalThis.SpeechRecognition,instances=[],texts=[],states=[],errors=[];
  class Recognition{
    constructor(){instances.push(this);this.aborts=0;this.stops=0;this.running=false;}
    start(){if(failStart||this.running)throw Error('Synthetic start failure');this.running=true;}
    abort(){this.aborts++;this.running=false;this.onend?.();}
    stop(){this.stops++;this.running=false;this.onend?.();}
  }
  globalThis.SpeechRecognition=Recognition;t.after(()=>{if(previous===undefined)delete globalThis.SpeechRecognition;else globalThis.SpeechRecognition=previous;});
  const microphone=createMicrophone({onText:(...args)=>{texts.push(args);onText?.(...args);},onState:(...args)=>{states.push(args);onState?.(...args);},onError:(...args)=>{errors.push(args);onError?.(...args);}});
  return {microphone,instances,texts,states,errors};
}
const result=text=>({results:[[{transcript:text}]]});

test('stopping recognition before native startup ignores all late callbacks',t=>{
  // Question: Can a canceled microphone start, publish text or report an old error after its owner stopped it?
  // Limits: Real microphone adapter with synthetic recognition callbacks; no physical microphone, permissions or browser scheduling.
  const f=fixture(t),ticket={};f.microphone.start(ticket);const recognition=f.instances[0];f.microphone.stop();
  const states=[...f.states];recognition.onstart();recognition.onresult(result('A late canceled transcript'));recognition.onerror({error:'network'});recognition.onend();
  assert.deepEqual(f.texts,[]);assert.deepEqual(f.errors,[]);assert.deepEqual(f.states,states);assert.equal(recognition.aborts,1);
});

test('an old recognizer cannot publish into or end a newer attempt',t=>{
  // Question: Does restarting recognition keep old result, error and end callbacks isolated from the new attempt and its ticket?
  // Limits: Distinct synthetic recognizer instances with deliberately reordered events; not native event timing or automatic Call retry.
  const f=fixture(t),oldTicket={},newTicket={};f.microphone.start(oldTicket);const old=f.instances[0];old.onstart();f.microphone.stop();
  f.microphone.start(newTicket);assert.equal(f.instances.length,2);const current=f.instances[1];current.onstart();const states=[...f.states];
  old.onresult(result('Obsolete text'));old.onerror({error:'network'});old.onend();old.onstart();assert.deepEqual(f.states,states);assert.deepEqual(f.errors,[]);assert.deepEqual(f.texts,[]);
  current.onresult(result('Current recognized text'));current.onresult(result('Duplicate final result'));
  assert.deepEqual(f.texts,[['Current recognized text',newTicket]]);assert.deepEqual(f.states.at(-1),[false,newTicket]);
});

test('a second start cancels a pending microphone attempt without waiting for native onstart',t=>{
  // Question: Does a rapid second dictation activation cancel startup rather than start the same recognizer twice?
  // Limits: Synthetic pending startup and abort; not touchscreen double-tap dispatch or browser permission dialogs.
  const f=fixture(t),ticket={};assert.equal(f.microphone.start(ticket),true);const first=f.instances[0];assert.equal(f.microphone.start({}),false);
  first.onstart();first.onresult(result('Canceled pending speech'));assert.equal(first.aborts,1);assert.deepEqual(f.texts,[]);assert.deepEqual(f.errors,[]);
});

test('native recognition failure invalidates its transcript and retains safe error behavior',t=>{
  // Question: Can a failed recognizer still deliver a transcript, or lose its attempt identity when reporting failure?
  // Limits: Synthetic error/end/result sequence through the adapter; not real browser permission diagnostics.
  const f=fixture(t),ticket={};f.microphone.start(ticket);const recognition=f.instances[0];recognition.onstart();recognition.onerror({error:'not-allowed'});recognition.onresult(result('Late failed speech'));recognition.onend();
  assert.deepEqual(f.texts,[]);assert.equal(f.errors.length,1);assert.match(f.errors[0][0],/not allowed/i);assert.equal(f.errors[0][1],ticket);assert.deepEqual(f.states.at(-1),[false,ticket]);
});

test('recognizer start failures leave no active attempt or publishable transcript',t=>{
  // Question: Does a thrown native start leave a recognizer able to publish text or keep the dictation attempt alive?
  // Limits: Synthetic synchronous start failure; not hardware exhaustion or permission prompts.
  const f=fixture(t,{failStart:true}),ticket={};assert.equal(f.microphone.start(ticket),false);const recognition=f.instances[0];recognition.onresult(result('Speech after failed start'));recognition.onstart();
  assert.deepEqual(f.texts,[]);assert.equal(f.errors.length,1);assert.equal(f.errors[0][1],ticket);assert.deepEqual(f.states.at(-1),[false,ticket]);
});

test('a current Call transcript reaches its explicit submit path before microphone cleanup',async t=>{
  // Question: Does late-event protection preserve the separate Call path that explicitly submits current recognized speech?
  // Limits: Real microphone and Call controllers with synthetic recognition/submission; not actual media, HTTP or rendered dialogs.
  let call;const submitted=[],f=fixture(t,{onText:text=>call.onTranscript(text),onState:active=>call?.onListening(active)});
  call=createVoiceCall({supported:true,startListening:()=>f.microphone.start(),stopListening:()=>f.microphone.stop(),submit:async text=>{submitted.push(text);return {reply:'A complete answer.',voicePending:false};}});
  call.open();call.connect();const recognition=f.instances[0];recognition.onstart();recognition.onresult(result('A deliberate Call question.'));
  for(let i=0;i<4;i++)await Promise.resolve();assert.deepEqual(submitted,['A deliberate Call question.']);assert.equal(call.snapshot().reply,'A complete answer.');
  recognition.onresult(result('Duplicate old Call question.'));assert.equal(submitted.length,1);call.dispose();
});
