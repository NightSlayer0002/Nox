// Browser voice is an optional layer. Text remains the source of truth.
export function selectBrowserVoice(voices) {
  const english = voices.filter(voice => voice.lang?.startsWith('en'));
  return english.find(voice => /natural|neural|premium|enhanced/i.test(voice.name))
    || english.find(voice => !voice.localService)
    || english.find(voice => /Daniel|Guy|David/i.test(voice.name)) || english[0];
}
export function createVoice({ onStart, onEnd, onError, requestAudio, AudioCtor = globalThis.Audio, urls = URL } = {}) {
  let enabled = false, generation = 0, engine = 'browser', natural = false;
  let controller, player, objectUrl;
  const synth = globalThis.speechSynthesis;
  const cleanup = () => {
    controller?.abort(); controller = null;
    if(player) {player.onplaying = player.onended = player.onerror = null; player.pause(); player = null;}
    if(objectUrl) {urls.revokeObjectURL(objectUrl); objectUrl = null;}
  };
  const stop = () => { generation++; cleanup(); synth?.cancel(); onEnd?.(); };
  return {
    get enabled() { return enabled; },
    get engine() { return engine; },
    get supported() { return engine === 'natural' ? natural : Boolean(synth); },
    configureNatural(value) { natural = Boolean(value && requestAudio && AudioCtor); if (!natural && engine === 'natural') this.setEngine('browser'); },
    setEngine(value) { stop(); engine = value === 'natural' && natural ? 'natural' : 'browser'; if(!this.supported) enabled = false; return engine; },
    setEnabled(value) { enabled = Boolean(value && this.supported); if (!enabled) stop(); return enabled; },
    stop,
    async speak(text, mode = 'companion') {
      if (!enabled || !this.supported) return;
      stop(); const version = generation;
      if(engine === 'natural') {
        controller = new AbortController();
        try {
          const blob = await requestAudio(text,mode,controller.signal);
          if(version !== generation) return;
          objectUrl = urls.createObjectURL(blob); player = new AudioCtor(objectUrl);
          player.onplaying = () => {if(version === generation) onStart?.();};
          player.onended = () => {if(version === generation) {cleanup(); onEnd?.();}};
          player.onerror = () => {if(version === generation) {cleanup(); onEnd?.(); onError?.('Natural voice could not play. Captions remain available; try Browser voice.');}};
          await player.play();
        } catch(error) {
          if(version !== generation || error.name === 'AbortError') return;
          cleanup(); onEnd?.(); onError?.(error.message || 'Natural voice could not play. Try Browser voice.');
        }
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      const preferred = selectBrowserVoice(voices);
      if (preferred) utterance.voice = preferred;
      utterance.rate = mode === 'uncanny' ? .9 : 1;
      utterance.pitch = 1;
      utterance.onstart = () => { if (version === generation) onStart?.(); };
      utterance.onend = () => { if (version === generation) onEnd?.(); };
      utterance.onerror = event => { if (version !== generation) return; onEnd?.(); if (!['canceled', 'interrupted'].includes(event.error)) onError?.('Your browser could not speak that reply. The caption is still here.'); };
      synth.speak(utterance);
    },
  };
}

export function createMicrophone({ onText, onState, onError }) {
  const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!Recognition) return { supported: false, start() { onError('Speech recognition is unavailable in this browser. You can type to NOX.'); }, stop() {} };
  const recognition = new Recognition();
  recognition.lang = 'en-US'; recognition.continuous = false; recognition.interimResults = false;
  let listening = false;
  recognition.onstart = () => { listening = true; onState(true); };
  recognition.onend = () => { listening = false; onState(false); };
  recognition.onerror = event => { if (event.error !== 'aborted') onError(`Microphone: ${event.error.replaceAll('-', ' ')}. Text chat still works.`); };
  recognition.onresult = event => { const text = event.results[0]?.[0]?.transcript; if (text) onText(text); };
  return {
    supported: true,
    start() { if (listening) { recognition.stop(); return; } try { recognition.start(); } catch { onError('Microphone is already starting. Give it a moment.'); } },
    stop() { recognition.abort(); },
  };
}
