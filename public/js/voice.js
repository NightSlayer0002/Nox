// Browser voice is an optional layer. Text remains the source of truth.
import { wavEnvelope, envelopeAt, speechChunks, speechTimeline, timelineAt } from './speech-envelope.js';
export function selectBrowserVoice(voices) {
  const english = voices.filter(voice => voice.lang?.startsWith('en'));
  const male=english.filter(voice=>/\b(Guy|Christopher|Eric|David|Mark|Daniel|Alex|Tom|Fred|Ravi|Ryan|Andrew|Brian|George|James|Arthur|Oliver)\b|English Male/i.test(voice.name));
  return male.find(v=>/natural|neural|premium|enhanced/i.test(v.name))||male[0]
    || english.find(voice => /natural|neural|premium|enhanced/i.test(voice.name))
    || english.find(voice => !voice.localService)
    || english.find(voice => /Daniel|Guy|David/i.test(voice.name)) || english[0];
}
export function createVoice({ onStart, onEnd, onError, requestAudio, AudioCtor = globalThis.Audio, AudioContextCtor=globalThis.AudioContext||globalThis.webkitAudioContext, urls = URL, now=()=>performance.now()/1000 } = {}) {
  let enabled = false, generation = 0, engine = 'browser', natural = false,speaker='troy',browserName='';
  let mouthPlayback=null,gapTimer,currentUtterance=null;
  let controller, player, objectUrl;
  let audioContext,audioDestination,audioSource;
  const synth = globalThis.speechSynthesis;
  function prepareCapture(){
    if(engine!=='natural'||!AudioContextCtor)return null;
    try{
      if(!audioContext){audioContext=new AudioContextCtor();audioDestination=audioContext.createMediaStreamDestination();}
      audioContext.resume().catch(()=>onError?.('Tap Voice to allow audio playback.'));
      return audioDestination.stream;
    }catch{return null;}
  }
  const cleanup = () => {
    clearTimeout(gapTimer);gapTimer=null;mouthPlayback=null;currentUtterance=null;
    controller?.abort(); controller = null;
    audioSource?.disconnect();audioSource=null;
    if(player) {player.onplaying = player.onended = player.onerror = player.onpause = player.onwaiting = null; player.pause(); player = null;}
    if(objectUrl) {urls.revokeObjectURL(objectUrl); objectUrl = null;}
  };
  const stop = () => { generation++; cleanup(); synth?.cancel(); onEnd?.(); };
  return {
    get enabled() { return enabled; },
    get engine() { return engine; },
    get mouthTiming(){return mouthPlayback?.envelope?'audio':mouthPlayback?.boundary?'word boundary':mouthPlayback?'estimated':'idle';},
    get mouthLevel(){
      if(!mouthPlayback||mouthPlayback.active===false)return 0;
      if(mouthPlayback.envelope)return player&&!player.paused?envelopeAt(mouthPlayback.envelope,player.currentTime||0):0;
      if(mouthPlayback.boundary){const age=now()-mouthPlayback.boundary.start;return age>=0&&age<mouthPlayback.boundary.duration?.35+.45*Math.abs(Math.sin(age*24)):0;}
      return timelineAt(mouthPlayback.timeline,now()-mouthPlayback.start);
    },
    setSpeaker(value){speaker=['austin','troy','daniel'].includes(value)?value:'troy';stop();},
    setBrowserVoice(value){browserName=typeof value==='string'?value:'';stop();},
    get supported() { return engine === 'natural' ? natural : Boolean(synth); },
    configureNatural(value) { natural = Boolean(value && requestAudio && AudioCtor); if (!natural && engine === 'natural') this.setEngine('browser'); },
    setEngine(value) { stop(); engine = value === 'natural' && natural ? 'natural' : 'browser'; if(!this.supported) enabled = false; return engine; },
    setEnabled(value) { enabled = Boolean(value && this.supported); if (!enabled) stop(); return enabled; },
    stop,
    prepareCapture,
    async speak(text, mode = 'companion', emotion = 'neutral', cues) {
      if (!enabled || !this.supported) return;
      stop(); const version = generation;
      if(engine === 'natural') {
        controller = new AbortController();
        try {
          const blob = await requestAudio(text,mode,controller.signal,emotion,speaker,cues?.map(cue=>({speech:cue.speech,emotion:cue.emotion})));
          if(version !== generation) return;
          const envelope=wavEnvelope(await blob.arrayBuffer());if(version!==generation)return;
          objectUrl = urls.createObjectURL(blob); player = new AudioCtor(objectUrl);
          if(prepareCapture()){
            audioSource=audioContext.createMediaElementSource(player);
            audioSource.connect(audioContext.destination);audioSource.connect(audioDestination);
          }
          player.onplaying = () => {if(version === generation) {mouthPlayback={envelope,timeline:speechTimeline(text),start:now()};onStart?.();}};
          player.onwaiting=player.onpause=()=>{if(version===generation&&mouthPlayback)mouthPlayback.active=false;};
          player.playbackRate=1.04;player.preservesPitch=false;
          player.onended = () => {if(version === generation) {cleanup(); onEnd?.();}};
          player.onerror = () => {if(version === generation) {cleanup(); onEnd?.(); onError?.('Natural voice could not play. Captions remain available; try Browser voice.');}};
          await player.play();
        } catch(error) {
          if(version !== generation || error.name === 'AbortError') return;
          cleanup(); onEnd?.(); onError?.(error.message || 'Natural voice could not play. Try Browser voice.');
        }
        return;
      }
      const voices = synth.getVoices();
      const preferred = voices.find(v=>v.name===browserName)||selectBrowserVoice(voices);
      const chunks=speechChunks(text);
      const rate=mode==='uncanny'||emotion==='sleepy'?.86:emotion==='happy'?1.04:emotion==='annoyed'?.98:1;
      const begin=index=>{
        if(version!==generation)return;
        const utterance=new SpeechSynthesisUtterance(chunks[index]);if(preferred)utterance.voice=preferred;
        currentUtterance=utterance;
        utterance.rate=rate;utterance.pitch=mode==='uncanny'?.97:emotion==='happy'?1.16:emotion==='annoyed'?1.04:1.1;
        utterance.onstart=()=>{if(version===generation&&currentUtterance===utterance){mouthPlayback={timeline:speechTimeline(chunks[index],rate),start:now()};onStart?.();}};
        utterance.onboundary=event=>{
          if(version!==generation||currentUtterance!==utterance||!mouthPlayback)return;
          if(event.name==='sentence'){mouthPlayback.boundary={start:now(),duration:0};return;}
          const word=chunks[index].slice(event.charIndex).match(/^[\p{L}\p{N}'’-]+/u)?.[0];
          mouthPlayback.boundary={start:now(),duration:word?Math.min(.6,.07+word.length*.038)/rate:0};
        };
        utterance.onend=()=>{if(version!==generation||currentUtterance!==utterance)return;currentUtterance=null;mouthPlayback=null;if(index+1<chunks.length)gapTimer=setTimeout(()=>begin(index+1),180);else onEnd?.();};
        utterance.onerror=event=>{if(version!==generation||currentUtterance!==utterance)return;cleanup();onEnd?.();if(!['canceled','interrupted'].includes(event.error))onError?.('Your browser could not speak that reply. The caption is still here.');};
        synth.speak(utterance);
      };
      if(chunks.length)begin(0);
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
