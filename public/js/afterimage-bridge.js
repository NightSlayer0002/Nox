import { normalizeAfterimage } from '../../shared/afterimage.js';
import { buildSelectedPerformance, createAfterimageController } from './afterimage-engine.js';
import { sanitizeAfterimageMetrics } from './afterimage-store.js';
import { normalizePacket } from '../../shared/character.js';
import {DEFAULT_EXPORT_PROFILE,resolveExportProfile} from './export-profile.js';

export function applyAfterimageCue(stage,value) {
  const cue=normalizePacket({...value,memory:''});
  stage.reset(false);
  stage.character.emotion=cue.emotion;
  stage.caption=cue.speech;stage.captionUntil=stage.time+7;
  if(cue.action!=='none')stage.run(cue.action);
  return cue;
}

const abortError = () => new DOMException('Reception stopped.','AbortError');
export function createAfterimageBridge(options = {}) {
  let adapter=null,disposed=false,request=null,requestVersion=0,ownsRecording=false,captureRequested=false,captureRun=null,captureOutcome=null;
  const listeners=new Set();
  let state;
  function refreshState() {
    const current=adapter?.getState?.() ?? {};
    if(current.recording===false)ownsRecording=false;
    const connection=current.connection ?? {kind:'loading'};
    const performance=controller.snapshot();
    state=Object.freeze({...performance,captureError:performance.captureError||captureOutcome?.error||'',captureOutcome:captureOutcome?.status||'',connected:Boolean(adapter),voiceEnabled:current.voiceEnabled === true,recording:current.recording === true,recordSupported:current.recordSupported === true,exportProfile:resolveExportProfile(current.exportProfile||DEFAULT_EXPORT_PROFILE).id,connection:Object.freeze({kind:connection.kind ?? 'loading',...(connection.provider ? {provider:Object.freeze({id:connection.provider.id,name:connection.provider.name,model:connection.provider.model})} : {})})});
    for (const listener of listeners) { try { listener(state); } catch {} }
    return state;
  }
  function cancelRequest() { requestVersion++;request?.abort();request=null; }
  function stopBody(reason) {
    captureRequested=false;
    try { adapter?.stop?.(reason); }
    finally { if (ownsRecording) { ownsRecording=false;adapter?.stopRecording?.(reason); }refreshState(); }
  }
  const controller=createAfterimageController({...options,
    onCue:(cue,index) => adapter?.cue?.(cue,index),
    onPrepare:(script,emotion,cues) => adapter?.prepare?.(script,emotion,cues),
    onBegin:() => {
      if (!captureRequested) return;
      if (adapter.getState?.().recording && !ownsRecording) throw new Error('Save the current recording before capturing this rehearsal.');
      captureRequested=false;ownsRecording=true;captureRun=controller.snapshot().version;adapter.startRecording();refreshState();return {capture:true};
    },
    onSpeak:(script,emotion,cues,lifecycle) => adapter?.speak?.(script,emotion,cues,lifecycle),
    onVoiceUnavailable:reason=>adapter?.stop?.(reason),
    onSpeaking:() => adapter?.isSpeaking?.(),onStop:stopBody,
  });
  controller.subscribe(refreshState);refreshState();
  const visibilityTarget=options.visibilityTarget;
  const hidden = () => { if (visibilityTarget?.hidden) { cancelRequest();if (ownsRecording && controller.snapshot().status !== 'playing') stopBody('hidden'); } };
  visibilityTarget?.addEventListener('visibilitychange',hidden);
  function stop(reason = 'user') {
    cancelRequest();const active=controller.snapshot().status === 'playing';controller.stop(reason);
    if (!active && ownsRecording) stopBody(reason);else refreshState();
  }
  function playPrepared(performance,capture=false) {
    captureRequested=capture;
    const played=controller.play(performance);
    if (!played && (ownsRecording || captureRequested)) stopBody('error');refreshState();return played;
  }
  return {
    snapshot:() => state,
    subscribe(listener) { if (disposed) return () => {};listeners.add(listener);return () => listeners.delete(listener); },
    refreshState,
    refresh:refreshState,
    recordingEnded(outcome) {
      const owned=ownsRecording||captureRun!==null,version=captureRun;ownsRecording=false;captureRun=null;
      if(owned&&outcome)captureOutcome=Object.freeze({...outcome});
      if(owned&&version===controller.snapshot().version&&controller.snapshot().status==='playing')controller.stop('recording-ended');
      refreshState();
    },
    connect(next) {
      if (disposed) throw new Error('The AFTERIMAGE bridge is closed.');
      stop('disconnected');adapter=next;refreshState();
      return () => { if (adapter !== next) return;stop('disconnected');adapter=null;refreshState(); };
    },
    async receive({seed,tone,variation,signal} = {}) {
      if (!adapter || disposed) throw new Error('The stage is not connected yet.');
      if (signal?.aborted || visibilityTarget?.hidden) throw abortError();
      stop('receive');const currentVersion=requestVersion,current=new AbortController();request=current;
      const abort=() => current.abort();signal?.addEventListener('abort',abort,{once:true});
      try {
        const result=await adapter.receive({seed,tone,...(variation === undefined ? {} : {variation}),signal:current.signal});
        if (disposed || current.signal.aborted || currentVersion !== requestVersion) throw abortError();
        const metrics=sanitizeAfterimageMetrics(result?.metrics);
        return {packet:normalizeAfterimage(result?.packet),...(metrics ? {metrics} : {})};
      } catch(error) {
        if(disposed || current.signal.aborted || currentVersion !== requestVersion)throw abortError();
        throw error;
      } finally { signal?.removeEventListener('abort',abort);if (request === current) request=null; }
    },
    play(packet,signalIndex=0,endingIndex=0,editedLines) {
      if (!adapter || disposed) return false;
      const performance=buildSelectedPerformance(packet,signalIndex,endingIndex,editedLines);stop('replaced');return playPrepared(performance);
    },
    recordAndPlay(packet,signalIndex=0,endingIndex=0,editedLines) {
      if (!adapter || disposed) throw new Error('The stage is not connected yet.');
      const performance=buildSelectedPerformance(packet,signalIndex,endingIndex,editedLines);
      if (adapter.getState?.().recording && !ownsRecording) throw new Error('Save the current recording before capturing this rehearsal.');
      stop('replaced');
      if (!adapter.getState?.().recordSupported || !adapter.startRecording) throw new Error('Canvas recording is unavailable in this browser. Use OBS to capture NOX.');
      adapter.validateRecording?.();
      captureOutcome=null;
      try { return playPrepared(performance,true); } catch (error) { stopBody('error');throw error; }
    },
    stop,
    record() { if (ownsRecording || captureRequested) stop('recording-stopped');else adapter?.record?.();refreshState(); },
    setVoice(enabled) { adapter?.setVoice?.(Boolean(enabled));refreshState();return state.voiceEnabled; },
    setExportProfile(value){const profile=resolveExportProfile(value);if(state.recording)return state.exportProfile;adapter?.setExportProfile?.(profile.id);refreshState();return state.exportProfile;},
    dispose() { if (disposed) return;stop('disposed');disposed=true;controller.dispose();visibilityTarget?.removeEventListener('visibilitychange',hidden);adapter=null;listeners.clear();refreshState(); },
  };
}

// UI imports this module; access keys and body objects stay inside app.js closures.
export const afterimageBridge=createAfterimageBridge({visibilityTarget:globalThis.document});
