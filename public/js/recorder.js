// Natural voice is routed through Web Audio; OS/browser speech is not capturable.
import {resolveExportProfile} from './export-profile.js';

export function createRecorder(canvas, onState, {getAudioStream}={}) {
  let session = null;
  let lastUrl = null;
  const supported = Boolean(canvas.captureStream && globalThis.MediaRecorder);
  return {
    supported,
    get active() { return Boolean(session); },
    start(profile) {
      if (!supported) throw new Error('Canvas recording is unavailable in this browser. Use OBS to capture NOX.');
      if (session) throw new Error('Wait for the current clip to finish saving.');
      const current = { stream: null, recorder: null, chunks: [], timer: null, stopping: false, finalized: false, failed: false };
      let type;
      const release = () => {
        clearTimeout(current.timer);current.stream?.getTracks().forEach(track=>track.stop());
      };
      const finish = () => {
        if (current.finalized) return;
        current.finalized = true;
        release();
        const blob = new Blob(current.chunks, { type });
        let clip = null;
        if (blob.size && !current.failed) {
          if (lastUrl) URL.revokeObjectURL(lastUrl);
          lastUrl = URL.createObjectURL(blob);
          const {id,width,height,aspectRatio,frameRate}=current.profile;
          clip = { blob, url: lastUrl, audio:current.audio, profile:id,width,height,aspectRatio,frameRate, filename: `nox-${new Date().toISOString().replace(/[:.]/g, '-')}.webm` };
        }
        if (session === current) { session = null; onState(false, clip); }
      };
      current.finish=finish;
      try {
        current.profile=resolveExportProfile(profile);
        // Stage must render at these dimensions before a stream is opened.
        if((canvas.width!==undefined&&canvas.width!==current.profile.width)||(canvas.height!==undefined&&canvas.height!==current.profile.height)) {
          throw new Error('Prepare the selected export resolution before recording.');
        }
        current.stream=canvas.captureStream(current.profile.frameRate);
        const voiceTracks=getAudioStream?.()?.getAudioTracks()||[];
        for(const track of voiceTracks)current.stream.addTrack(track.clone());
        current.audio=voiceTracks.length>0;
        type=(current.audio?['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']:['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']).find(value=>MediaRecorder.isTypeSupported(value));
        if(!type)throw new Error('WebM export is unavailable here. Use Chrome, Edge, or OBS.');
        current.recorder = new MediaRecorder(current.stream, { mimeType: type, videoBitsPerSecond: current.profile.videoBitsPerSecond });
        current.recorder.ondataavailable = event => { if (event.data.size) current.chunks.push(event.data); };
        current.recorder.onstop = finish;
        current.recorder.onerror = () => { current.failed = true; finish(); };
        session = current;
        current.recorder.start(250);
        current.timer = setTimeout(() => this.stop(), 60000);
        onState(true, false);
      } catch (error) {
        current.failed=true;current.finalized=true;
        if(current.recorder?.state==='recording')try{current.recorder.stop();}catch{}
        release();session=null;onState(false,null);throw error;
      }
    },
    stop() {
      if(session&&!session.stopping&&session.recorder.state==='recording') {
        const current=session;current.stopping=true;
        try{current.recorder.stop();}
        catch(error){current.failed=true;current.finish();throw error;}
      }
    },
  };
}
