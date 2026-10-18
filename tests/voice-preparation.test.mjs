import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoice } from '../public/js/voice.js';
import {fixtureWav} from './helpers/wav.mjs';

function naturalVoice(options = {}) {
  const requests = [], players = [], states = [];
  const voice = createVoice({
    requestAudio: (text, mode, signal, emotion, speaker, cues) => new Promise((resolve, reject) => requests.push({ text, mode, signal, emotion, speaker, cues, resolve, reject })),
    AudioCtor: class {
      constructor(url) { this.url = url; this.paused = true; players.push(this); }
      play() { this.paused = false; return Promise.resolve(); }
      pause() { this.paused = true; }
    },
    urls: { createObjectURL: () => `blob:${players.length}`, revokeObjectURL() {} },
    onState: state => states.push(state),
    ...options,
  });
  voice.configureNatural(true); voice.setEngine('natural'); voice.setEnabled(true);
  return { voice, requests, players, states };
}

function clipFeed() {
  const pending = [], queued = []; let ended = false;
  return {
    push(blob) { const item = {value:{blob},done:false}; if(pending.length)pending.shift().resolve(item);else queued.push(item); },
    end() { ended=true;while(pending.length)pending.shift().resolve({done:true}); },
    fail(error) { ended=true;if(pending.length)pending.shift().reject(error);else queued.push({error}); },
    [Symbol.asyncIterator]() { return this; },
    next() { if(queued.length){const item=queued.shift();return item.error?Promise.reject(item.error):Promise.resolve(item);}if(ended)return Promise.resolve({done:true});return new Promise((resolve,reject)=>pending.push({resolve,reject})); },
  };
}

test('preparation starts audio immediately and speaking reuses it without announcing playback early', async () => {
  let starts = 0;
  const { voice, requests, players, states } = naturalVoice({ onStart: () => starts++ });
  const prepared = voice.prepare('A complete reply.', 'companion', 'curious');
  assert.equal(requests.length, 1);
  assert.equal(voice.state, 'preparing');
  assert.equal(starts, 0);
  const speech = voice.speak('A complete reply.', 'companion', 'curious');
  assert.equal(requests.length, 1);
  requests[0].resolve(new Blob(['audio']));
  await prepared; await speech;
  assert.equal(players.length, 1);
  assert.equal(starts, 0);
  assert.equal(voice.mouthLevel, 0);
  players[0].onplaying();
  assert.equal(starts, 1);
  assert.equal(voice.state, 'speaking');
  assert.ok(states.includes('preparing'));
  voice.stop();
  assert.equal(voice.state, 'idle');
});

test('a failed prepared request is reported when consumed without spending quota on an automatic retry', async () => {
  const errors = [];
  const { voice, requests, players } = naturalVoice({ onError: error => errors.push(error) });
  const prepared = voice.prepare('The provider will reject this.');
  requests[0].reject(Error('Speech quota exceeded.'));
  assert.equal(await prepared, null);
  assert.deepEqual(errors, []);
  const speech = voice.speak('The provider will reject this.');
  assert.equal(requests.length, 1);
  await speech;
  assert.deepEqual(errors, ['Speech quota exceeded.']);
  assert.equal(players.length, 0);
  assert.equal(voice.state, 'idle');
  const retry = voice.speak('The provider will reject this.');
  assert.equal(requests.length, 2);
  requests[1].resolve(new Blob(['retry audio']));
  await retry;
  assert.equal(players.length, 1);
  voice.stop();
});

test('preparing a later reply leaves current playback running and replaces only the obsolete prefetch', async () => {
  const { voice, requests, players } = naturalVoice();
  const first = voice.speak('Speaking now.');
  requests[0].resolve(new Blob(['first audio'])); await first; players[0].onplaying();
  const obsolete = voice.prepare('Obsolete next reply.');
  const next = voice.prepare('Actual next reply.');
  assert.equal(players[0].paused, false);
  assert.equal(voice.state, 'speaking');
  assert.equal(requests[1].signal.aborted, true);
  assert.equal(requests[2].signal.aborted, false);
  requests[1].resolve(new Blob(['obsolete audio'])); await obsolete;
  assert.equal(players.length, 1);
  requests[2].resolve(new Blob(['actual audio'])); await next;
  const second = voice.speak('Actual next reply.'); await second;
  assert.equal(requests.length, 3);
  assert.equal(players[0].paused, true);
  assert.equal(players.length, 2);
  voice.stop();
});

test('stop, mute, speaker and engine changes abort preparation before a late response can affect readiness', async () => {
  for (const cancel of [voice => voice.stop(), voice => voice.setEnabled(false), voice => voice.setSpeaker('austin'), voice => voice.setEngine('browser')]) {
    const { voice, requests, players } = naturalVoice();
    const prepared = voice.prepare('Cancelled reply.');
    cancel(voice);
    assert.equal(requests[0].signal.aborted, true);
    requests[0].resolve(new Blob(['late audio']));
    assert.equal(await prepared, null);
    assert.equal(voice.state, 'idle');
    assert.equal(players.length, 0);
  }
});

test('muted and browser speech never spend natural voice quota on preparation', async () => {
  const { voice, requests } = naturalVoice();
  voice.setEnabled(false);
  assert.equal(await voice.prepare('Muted reply.'), null);
  voice.setEnabled(true); voice.setEngine('browser');
  assert.equal(await voice.prepare('Browser reply.'), null);
  assert.equal(requests.length, 0);
});

test('mode, emotion, speaker and speech cue changes cannot reuse mismatched audio', async () => {
  const { voice, requests } = naturalVoice();
  const originalCues = [{ speech: 'Reply.', emotion: 'curious', action: 'wave' }];
  const first = voice.prepare('Reply.', 'companion', 'curious', originalCues);
  const duplicate = voice.prepare('Reply.', 'companion', 'curious', [{ speech: 'Reply.', emotion: 'curious', action: 'none' }]);
  assert.equal(first, duplicate);
  originalCues[0].emotion = 'annoyed';
  assert.deepEqual(requests[0].cues, [{ speech: 'Reply.', emotion: 'curious' }]);
  const changedMode = voice.prepare('Reply.', 'uncanny', 'curious', originalCues);
  assert.equal(requests[0].signal.aborted, true);
  const changedEmotion = voice.prepare('Reply.', 'uncanny', 'sleepy', originalCues);
  assert.equal(requests[1].signal.aborted, true);
  const changedCues = voice.prepare('Reply.', 'uncanny', 'sleepy', [{ speech: 'Reply.', emotion: 'happy' }]);
  assert.equal(requests[2].signal.aborted, true);
  voice.setSpeaker('daniel');
  assert.equal(requests[3].signal.aborted, true);
  const changedSpeaker = voice.prepare('Reply.', 'uncanny', 'sleepy', [{ speech: 'Reply.', emotion: 'happy' }]);
  assert.equal(requests[4].speaker, 'daniel');
  for (const request of requests) request.resolve(new Blob(['audio']));
  await Promise.all([first, duplicate, changedMode, changedEmotion, changedCues, changedSpeaker]);
  voice.stop();
});

test('recent playback reuses prepared audio and older replies are evicted from a bounded replay cache', async () => {
  const { voice, requests, players } = naturalVoice();
  for (const text of ['First reply.', 'Second reply.', 'Third reply.']) {
    const speech = voice.speak(text);
    requests.at(-1).resolve(new Blob([text])); await speech;
    players.at(-1).onended();
  }
  await voice.speak('Third reply.');
  assert.equal(requests.length, 3);
  voice.stop();
  const oldest = voice.speak('First reply.');
  assert.equal(requests.length, 4);
  requests[3].resolve(new Blob(['first regenerated'])); await oldest;
  voice.stop();
});

test('ready means the downloaded audio and its mouth envelope have both been prepared', async () => {
  const { voice, requests, players } = naturalVoice();
  let finishReading,beginReading;
  const readingStarted=new Promise(resolve=>{beginReading=resolve;});
  const blob = new Blob(['audio']);
  blob.arrayBuffer = () => new Promise(resolve => { finishReading = resolve;beginReading(); });
  const prepared = voice.prepare('Wait for the waveform.');
  requests[0].resolve(blob);
  await readingStarted;
  assert.equal(voice.state, 'preparing');
  assert.equal(players.length, 0);
  finishReading(new ArrayBuffer(0));
  await prepared;
  assert.equal(voice.state, 'ready');
  assert.equal(players.length, 0);
  await voice.speak('Wait for the waveform.');
  assert.equal(requests.length, 1);
  assert.equal(players.length, 1);
  voice.stop();
});

test('progressive audio starts the first clip while later synthesis is pending and keeps one narration lifecycle', async () => {
  const feed=clipFeed(),signals=[];let starts=0,ends=0;
  const {voice,requests,players}=naturalVoice({requestClips:(_text,_mode,signal)=>{signals.push(signal);return feed;},onStart:()=>starts++,onEnd:()=>ends++});
  const before=ends;
  const prepared=voice.prepare('First section. Later section.');
  const speech=voice.speak('First section. Later section.');
  assert.equal(signals.length,1);
  feed.push(new Blob(['first']));
  await prepared;await speech;
  assert.equal(requests.length,0);
  assert.equal(signals.length,1);
  assert.equal(players.length,1);
  players[0].onplaying();
  assert.equal(starts,1);
  const afterStart=ends;
  assert.equal(afterStart,before+1);
  players[0].onended();
  assert.equal(voice.mouthLevel,0);
  assert.equal(ends,afterStart);
  feed.push(new Blob(['second']));feed.end();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(players.length,2);
  players[1].onplaying();
  assert.equal(starts,1);
  players[1].onended();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ends,afterStart+1);
  assert.equal(voice.state,'idle');
  voice.stop();
});

test('cancelling progressive speech aborts later clips and stale audio events cannot touch a newer reply',async()=>{
  const feeds=[clipFeed(),clipFeed()],signals=[];let starts=0,ends=0;
  const {voice,players}=naturalVoice({requestClips:(_text,_mode,signal)=>{signals.push(signal);return feeds[signals.length-1];},onStart:()=>starts++,onEnd:()=>ends++});
  const first=voice.speak('Old turn.');feeds[0].push(new Blob(['old first']));await first;
  players[0].onplaying();
  const oldStart=players[0].onplaying,oldEnd=players[0].onended;
  players[0].onended();
  voice.stop();
  assert.equal(signals[0].aborted,true);
  const second=voice.speak('Current turn.');feeds[1].push(new Blob(['current']));feeds[1].end();await second;players[1].onplaying();
  const before={starts,ends};oldStart();oldEnd();
  feeds[0].push(new Blob(['obsolete later']));feeds[0].end();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(players.length,2);
  assert.deepEqual({starts,ends},before);
  assert.equal(players[1].paused,false);
  voice.stop();
});

test('a later progressive provider failure ends once without replaying or requesting fallback audio',async()=>{
  const feed=clipFeed(),errors=[];let starts=0,ends=0;
  const {voice,players,requests}=naturalVoice({requestClips:()=>feed,onStart:()=>starts++,onEnd:()=>ends++,onError:error=>errors.push(error)});
  const speech=voice.speak('First clip then an error.');feed.push(new Blob(['first']));await speech;players[0].onplaying();
  feed.fail(Error('Voice stream interrupted.'));
  await new Promise(resolve=>setImmediate(resolve));
  const before=ends;players[0].onended();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(starts,1);assert.equal(ends,before+1);
  assert.equal(players.length,1);assert.equal(requests.length,0);
  assert.deepEqual(errors,['Voice stream interrupted.']);assert.equal(voice.state,'idle');
  voice.stop();
});

test('progressive audio is bounded across clips before an oversized later clip can play',async()=>{
  const feed=clipFeed(),errors=[];
  const {voice,players}=naturalVoice({requestClips:()=>feed,onError:error=>errors.push(error)});
  const speech=voice.speak('Bounded audio.');feed.push(new Blob([new Uint8Array(1200000)]));await speech;
  feed.push(new Blob([new Uint8Array(1200000)]));feed.end();
  await new Promise(resolve=>setImmediate(resolve));
  players[0].onended();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(players.length,1);assert.equal(errors.length,1);assert.equal(voice.state,'idle');
  voice.stop();
});

test('each progressive WAV follows its own amplitude and reaches the same capture destination',async()=>{
  const feed=clipFeed(),links=[],speakers={},destination={stream:{getAudioTracks:()=>[{kind:'audio'}]}};let disconnects=0;
  class Context{
    constructor(){this.destination=speakers;}
    createMediaStreamDestination(){return destination;}
    createMediaElementSource(){return {connect:node=>links.push(node),disconnect:()=>disconnects++};}
    resume(){return Promise.resolve();}
  }
  const {voice,players}=naturalVoice({requestClips:()=>feed,AudioContextCtor:Context});
  const speech=voice.speak('An audible clip. A quiet clip.');
  feed.push(new Blob([fixtureWav(Array(160).fill(12000),8000)]));
  feed.push(new Blob([fixtureWav(Array(160).fill(0),8000)]));feed.end();
  await speech;players[0].onplaying();
  assert.equal(voice.mouthTiming,'audio');assert.ok(voice.mouthLevel>.4);
  players[0].onended();await new Promise(resolve=>setImmediate(resolve));
  players[1].onplaying();assert.equal(voice.mouthTiming,'audio');assert.equal(voice.mouthLevel,0);
  assert.deepEqual(links,[speakers,destination,speakers,destination]);
  assert.equal(voice.prepareCapture(),destination.stream);
  voice.stop();assert.equal(disconnects,2);
});

test('late callbacks from an earlier clip cannot replay the next clip in the same narration',async()=>{
  const feed=clipFeed();
  const {voice,players}=naturalVoice({requestClips:()=>feed});
  const speech=voice.speak('Two clips exactly once.');
  feed.push(new Blob(['first']));feed.push(new Blob(['second']));feed.end();
  await speech;
  const oldEnd=players[0].onended,oldError=players[0].onerror;
  oldEnd();await new Promise(resolve=>setImmediate(resolve));
  oldEnd();oldError();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(players.length,2);
  assert.equal(players[1].paused,false);
  voice.stop();
});
