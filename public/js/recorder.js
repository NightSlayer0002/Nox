// Natural voice is routed through Web Audio; OS/browser speech is not capturable.
export function createRecorder(canvas, onState, {getAudioStream}={}) {
  let session = null;
  let lastUrl = null;
  const supported = Boolean(canvas.captureStream && globalThis.MediaRecorder);
  return {
    supported,
    get active() { return Boolean(session); },
    start() {
      if (!supported) throw new Error('Canvas recording is unavailable in this browser. Use OBS to capture NOX.');
      if (session) throw new Error('Wait for the current clip to finish saving.');
      const current = { stream: canvas.captureStream(30), recorder: null, chunks: [], timer: null, stopping: false, finalized: false, failed: false };
      let type;
      const finish = () => {
        if (current.finalized) return;
        current.finalized = true;
        clearTimeout(current.timer); current.stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(current.chunks, { type });
        let clip = null;
        if (blob.size && !current.failed) {
          if (lastUrl) URL.revokeObjectURL(lastUrl);
          lastUrl = URL.createObjectURL(blob);
          clip = { blob, url: lastUrl, audio:current.audio, filename: `nox-${new Date().toISOString().replace(/[:.]/g, '-')}.webm` };
        }
        if (session === current) { session = null; onState(false, clip); }
      };
      try {
        const voiceTracks=getAudioStream?.()?.getAudioTracks()||[];
        for(const track of voiceTracks)current.stream.addTrack(track.clone());
        current.audio=voiceTracks.length>0;
        type=(current.audio?['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']:['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']).find(value=>MediaRecorder.isTypeSupported(value));
        if(!type)throw new Error('WebM export is unavailable here. Use Chrome, Edge, or OBS.');
        current.recorder = new MediaRecorder(current.stream, { mimeType: type, videoBitsPerSecond: 5000000 });
        current.recorder.ondataavailable = event => { if (event.data.size) current.chunks.push(event.data); };
        current.recorder.onstop = finish;
        current.recorder.onerror = () => { current.failed = true; finish(); };
        session = current;
        current.recorder.start(250);
        current.timer = setTimeout(() => this.stop(), 60000);
        onState(true, false);
      } catch (error) {
        current.stream.getTracks().forEach(track => track.stop());
        clearTimeout(current.timer); session = null; throw error;
      }
    },
    stop() { if (session && !session.stopping && session.recorder.state === 'recording') { session.stopping = true; session.recorder.stop(); } },
  };
}
