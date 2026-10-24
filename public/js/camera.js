export function createCamera() {
  let stream = null, generation=0;
  const release=value=>value?.getTracks().forEach(track=>track.stop());
  const interrupted=()=>new DOMException('Camera preview stopped.','AbortError');
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true;
  return {
    get active() { return Boolean(stream); },
    video,
    async start() {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera preview is unavailable in this browser. NOX’s stage still works.');
      if (stream) return video;
      const version=++generation;let acquired;
      try {
        acquired = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
        if(version!==generation){release(acquired);acquired=null;throw interrupted();}
        stream=acquired;
        video.srcObject = stream;
        await video.play();
        if(version!==generation)throw interrupted();
        return video;
      } catch (error) {
        if(version!==generation)throw interrupted();
        release(acquired);if(stream===acquired){stream=null;video.srcObject=null;}
        if(error.name==='AbortError')throw interrupted();
        throw new Error(error.name === 'NotAllowedError' ? 'Camera permission was declined. You can keep using NOX without it.' : 'Could not start your camera. Check that it’s connected and available.');
      }
    },
    stop() { generation++;release(stream);stream = null; video.srcObject = null; },
  };
}
