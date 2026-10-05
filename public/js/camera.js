export function createCamera() {
  let stream = null;
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true;
  return {
    get active() { return Boolean(stream); },
    video,
    async start() {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera preview is unavailable in this browser. NOX’s stage still works.');
      if (stream) return video;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
        video.srcObject = stream;
        await video.play();
        return video;
      } catch (error) {
        stream?.getTracks().forEach(track => track.stop()); stream = null;
        throw new Error(error.name === 'NotAllowedError' ? 'Camera permission was declined. You can keep using NOX without it.' : 'Could not start your camera. Check that it’s connected and available.');
      }
    },
    stop() { stream?.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null; },
  };
}
