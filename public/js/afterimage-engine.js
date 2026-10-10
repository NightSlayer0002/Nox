import { normalizeAfterimage } from '../../shared/afterimage.js';
import { ACTIONS, EMOTIONS, cleanText } from '../../shared/character.js';

export const AFTERIMAGE_CUE_MS = 7000;
export const AFTERIMAGE_DURATION_MS = AFTERIMAGE_CUE_MS * 4;

export function normalizeEditedLines(value) {
  if (!Array.isArray(value) || value.length !== 4) throw new TypeError('A rehearsal needs four lines.');
  const lines = value.map(line => cleanText(line, 90));
  if (lines.some(line => !line)) throw new TypeError('Every rehearsal line needs some text.');
  return lines;
}

export function buildSelectedPerformance(value, signalIndex = 0, endingIndex = 0, editedLines) {
  const packet = normalizeAfterimage(value);
  if (!Number.isInteger(signalIndex) || signalIndex < 0 || signalIndex > 2) throw new RangeError('Choose one of the three signals.');
  if (!Number.isInteger(endingIndex) || endingIndex < 0 || endingIndex > 1) throw new RangeError('Choose one of the two endings.');
  const signal = packet.signals[signalIndex], ending = signal.endings[endingIndex];
  const lines = editedLines === undefined ? null : normalizeEditedLines(editedLines);
  const cues = [...signal.beats, ending].map((cue, index) => Object.freeze({speech: lines?.[index] ?? cue.speech, emotion: cue.emotion, action: cue.action}));
  return Object.freeze({title:packet.title, signalLabel:signal.label, endingLabel:ending.label, cues:Object.freeze(cues), script:cues.map(cue => cue.speech).join('\n'), caption:packet.caption, durationMs:AFTERIMAGE_DURATION_MS});
}

function safePerformance(value) {
  if (!value || !Array.isArray(value.cues) || value.cues.length !== 4) throw new TypeError('A performance needs four cues.');
  const cues = value.cues.map(cue => {
    if (!cue || typeof cue.speech !== 'string' || !cue.speech.trim() || !EMOTIONS.includes(cue.emotion) || !ACTIONS.includes(cue.action)) throw new TypeError('A performance cue is invalid.');
    const speech=cleanText(cue.speech,90);
    if(!speech)throw new TypeError('Every performance cue needs text.');
    return Object.freeze({speech, emotion:cue.emotion, action:cue.action});
  });
  return {cues, script:cues.map(cue => cue.speech).join('\n')};
}

// Owns cue timing only. Stage and voice keep their existing animation/audio clocks.
export function createAfterimageController({onCue, onSpeak, onStop, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout, visibilityTarget} = {}) {
  let version = 0, timer = null, startedAt = 0, disposed = false, run = null, abortCleanup;
  let state = Object.freeze({status:'idle',cueIndex:-1,elapsedMs:0,durationMs:AFTERIMAGE_DURATION_MS,reason:'',version});
  const listeners = new Set();
  function publish(next) {
    state = Object.freeze({...state,...next,version});
    for (const listener of listeners) { try { listener(state); } catch {} }
  }
  function cleanup() {
    if (timer !== null) clearTimer(timer);
    timer = null; abortCleanup?.(); abortCleanup = undefined;
  }
  function finish(reason, status = 'stopped') {
    const active = state.status === 'playing';
    cleanup(); version++; run = null;
    state=Object.freeze({...state,status,reason,version,...(status === 'complete' ? {elapsedMs:AFTERIMAGE_DURATION_MS} : {})});
    if (active) { try { onStop?.(reason); } catch {} }
    for (const listener of listeners) { try { listener(state); } catch {} }
  }
  function tick(currentVersion) {
    if (disposed || currentVersion !== version || state.status !== 'playing') return;
    timer = null;
    const elapsedMs = Math.min(AFTERIMAGE_DURATION_MS, Math.max(0, now() - startedAt));
    if (elapsedMs >= AFTERIMAGE_DURATION_MS) { finish('complete','complete'); return; }
    const cueIndex = Math.floor(elapsedMs / AFTERIMAGE_CUE_MS);
    if (cueIndex !== state.cueIndex) {
      publish({cueIndex,elapsedMs});
      if(currentVersion !== version || state.status !== 'playing')return;
      try { onCue?.(run.cues[cueIndex],cueIndex); }
      catch { finish('error'); return; }
    } else publish({elapsedMs});
    if (currentVersion === version && state.status === 'playing') timer = setTimer(() => tick(currentVersion), Math.min(250, AFTERIMAGE_DURATION_MS - elapsedMs));
  }
  const hidden = () => { if (visibilityTarget?.hidden) finish('hidden'); };
  visibilityTarget?.addEventListener('visibilitychange',hidden);
  return {
    snapshot:() => state,
    subscribe(listener) { if (disposed) return () => {}; listeners.add(listener); return () => listeners.delete(listener); },
    play(value, {signal} = {}) {
      if (disposed || visibilityTarget?.hidden || signal?.aborted) return false;
      const performance = safePerformance(value);
      if (state.status === 'playing') finish('replaced');
      cleanup(); version++; run = performance; startedAt = now();
      const currentVersion = version;
      if (signal) {
        const abort = () => { if (currentVersion === version) finish('aborted'); };
        signal.addEventListener('abort',abort,{once:true}); abortCleanup = () => signal.removeEventListener('abort',abort);
      }
      publish({status:'playing',cueIndex:0,elapsedMs:0,reason:''});
      if(currentVersion !== version || state.status !== 'playing')return false;
      try {
        onCue?.(run.cues[0],0);
        if (currentVersion !== version) return false;
        const speaking = onSpeak?.(run.script,run.cues[0].emotion,run.cues);
        speaking?.catch?.(() => { if (currentVersion === version && state.status === 'playing') finish('error'); });
      } catch { finish('error'); return false; }
      if (currentVersion !== version) return false;
      timer = setTimer(() => tick(currentVersion),250);
      return true;
    },
    stop(reason = 'user') { if (!disposed) finish(reason); },
    dispose() {
      if (disposed) return;
      if (state.status === 'playing') finish('disposed'); else cleanup();
      disposed = true; version++; visibilityTarget?.removeEventListener('visibilitychange',hidden); listeners.clear();
    },
  };
}

const markdownText = value => String(value ?? '').replace(/[\\`*_{}[\]<>#]/g,'\\$&');
const timecode = milliseconds => `00:${String(milliseconds / 1000).padStart(2,'0')}`;
export function toMarkdown(reception) {
  const packet = normalizeAfterimage(reception?.packet ?? reception);
  const performance = buildSelectedPerformance(packet,reception?.signalIndex ?? 0,reception?.endingIndex ?? 0,reception?.editedLines);
  const signal = packet.signals[reception?.signalIndex ?? 0];
  const lines = [`# AFTERIMAGE — ${markdownText(packet.title)}`, '', `Source: ${reception?.source === 'live' ? 'AI reception' : 'First contact · authored example'}`, `Tone: ${markdownText(reception?.tone ?? 'wonder')}`];
  if (reception?.seed) lines.push(`Seed: ${markdownText(reception.seed)}`);
  lines.push('',markdownText(packet.anchor),'',`## ${markdownText(performance.signalLabel)} · ${markdownText(performance.endingLabel)}`,'',markdownText(signal.premise),'');
  performance.cues.forEach((cue,index) => lines.push(`### ${timecode(index * AFTERIMAGE_CUE_MS)}–${timecode((index + 1) * AFTERIMAGE_CUE_MS)} · ${index === 3 ? 'Ending' : `Act ${index + 1}`}`,'',`> ${markdownText(cue.speech)}`,'',`Emotion: ${cue.emotion} · Scene: ${cue.action}`,''));
  lines.push('## Caption','',markdownText(packet.caption),'','28-second rehearsal. Cue timing is a schedule, not word-level audio alignment. Capture is a silent WebM of the local stage and captions.','');
  return lines.join('\n');
}
