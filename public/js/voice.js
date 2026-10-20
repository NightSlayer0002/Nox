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
export function createVoice({ onStart, onEnd, onError, onState, requestAudio, requestClips, AudioCtor = globalThis.Audio, AudioContextCtor=globalThis.AudioContext||globalThis.webkitAudioContext, urls = URL, now=()=>performance.now()/1000 } = {}) {
  let enabled = false, generation = 0, engine = 'browser', natural = false,speaker='troy',browserName='',pace=1;
  let mouthPlayback=null,gapTimer,currentUtterance=null;
  let player, objectUrl, currentAudio=null, preparedAudio=null, state='idle';
  const audioCache=new Map();
  const setState=value=>{if(state!==value){state=value;onState?.(value);}};
  function updateState(){
    if(mouthPlayback&&mouthPlayback.active!==false)setState('speaking');
    else if(currentAudio?.loading||preparedAudio?.status==='pending')setState('preparing');
    else if(currentAudio?.status==='ready'||preparedAudio?.status==='ready')setState('ready');
    else setState('idle');
  }
  const discard=entry=>{
    if(!entry)return;
    if(entry.loading){entry.controller.abort();entry.loading=false;entry.status='aborted';wake(entry);}
    if(audioCache.get(entry.key)===entry)audioCache.delete(entry.key);
    if(preparedAudio===entry)preparedAudio=null;
  };
  function wake(entry){for(const resolve of entry.waiters)resolve();entry.waiters.clear();}
  async function clipAt(entry,index){
    while(!entry.clips[index]&&entry.loading&&!entry.controller.signal.aborted)await new Promise(resolve=>entry.waiters.add(resolve));
    return entry.controller.signal.aborted?null:entry.clips[index]||null;
  }
  function audioFor(text,mode,emotion,cues){
    const speechCues=cues?.map(cue=>({speech:cue.speech,emotion:cue.emotion}));
    const key=JSON.stringify([text,mode,emotion,speaker,speechCues]);
    let entry=preparedAudio?.key===key?preparedAudio:audioCache.get(key);
    if(entry){audioCache.delete(key);audioCache.set(key,entry);return entry;}
    if(preparedAudio&&preparedAudio!==currentAudio)discard(preparedAudio);
    // Keep at most the active/recent reply and the next reply, each up to 2 MiB.
    while(audioCache.size>=2){const oldest=[...audioCache.values()].find(value=>value!==currentAudio);if(!oldest)break;discard(oldest);}
    entry={key,status:'pending',loading:true,clips:[],waiters:new Set(),controller:new AbortController()};audioCache.set(key,entry);
    // Start the provider before returning, so history writes and rendering can overlap it.
    entry.promise=clipAt(entry,0);
    entry.completion=(async()=>{
      const source=requestClips?await requestClips(text,mode,entry.controller.signal,emotion,speaker,speechCues):[{blob:await requestAudio(text,mode,entry.controller.signal,emotion,speaker,speechCues)}];
      let size=0;
      for await(const clip of source){
        if(entry.controller.signal.aborted)return;
        const blob=clip.blob;
        size+=blob.size;if(!blob.size||size>2*1024*1024||entry.clips.length>=4)throw Error('Natural voice returned invalid audio.');
        const envelope=clip.envelope??wavEnvelope(await blob.arrayBuffer());
        if(entry.controller.signal.aborted)return;
        entry.clips.push({blob,envelope});entry.status='ready';wake(entry);updateState();
      }
      if(!entry.clips.length)throw Error('Natural voice returned no audio.');
      entry.loading=false;wake(entry);updateState();
    })().catch(error=>{entry.error=error;entry.loading=false;entry.status='error';if(audioCache.get(key)===entry)audioCache.delete(key);wake(entry);updateState();});
    return entry;
  }
  let audioContext,audioDestination,audioSource,captureSilence;
  const synth = globalThis.speechSynthesis;
  function prepareCapture(){
    if(engine!=='natural'||!AudioContextCtor)return null;
    try{
      if(!audioContext){
        audioContext=new AudioContextCtor();audioDestination=audioContext.createMediaStreamDestination();
        // A fresh capture must have audio frames before the first spoken reply.
        // Feed digital silence only to the recording bus, never the speakers.
        if(audioContext.createConstantSource){
          captureSilence=audioContext.createConstantSource();captureSilence.offset.value=0;
          captureSilence.connect(audioDestination);captureSilence.start();
        }
      }
      audioContext.resume().catch(()=>onError?.('Tap Voice to allow audio playback.'));
      return audioDestination.stream;
    }catch{return null;}
  }
  const cleanup = () => {
    clearTimeout(gapTimer);gapTimer=null;mouthPlayback=null;currentUtterance=null;
    audioSource?.disconnect();audioSource=null;
    if(player) {player.onplaying = player.onended = player.onerror = player.onpause = player.onwaiting = null; player.pause(); player = null;}
    if(objectUrl) {urls.revokeObjectURL(objectUrl); objectUrl = null;}
  };
  const stopPlayback = retained => {
    generation++;cleanup();
    for(const entry of audioCache.values())if(entry!==retained&&entry.loading)discard(entry);
    currentAudio=null;preparedAudio=retained||null;synth?.cancel();onEnd?.();updateState();
  };
  const stop=()=>{stopPlayback();preparedAudio=null;updateState();};
  return {
    get enabled() { return enabled; },
    get engine() { return engine; },
    get state() { return state; },
    get pace(){return pace;},
    setPace(value){
      pace=typeof value==='number'&&Number.isFinite(value)&&value>=.75&&value<=1.25?value:1;
      // Media time continues advancing at the new rate, keeping the existing
      // amplitude envelope and capture in sync without another provider request.
      if(player)player.playbackRate=1.04*pace;
      // Browser synthesis snapshots rate per utterance. The next sentence uses
      // the new preference; cancelling this sentence would interrupt the reply.
      return pace;
    },
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
    configureNatural(value) { natural = Boolean(value && (requestAudio||requestClips) && AudioCtor); if (!natural && engine === 'natural') this.setEngine('browser'); },
    setEngine(value) { stop(); engine = value === 'natural' && natural ? 'natural' : 'browser'; if(!this.supported) enabled = false; return engine; },
    setEnabled(value) { enabled = Boolean(value && this.supported); if (!enabled) stop(); return enabled; },
    stop,
    prepareCapture,
    prepare(text,mode='companion',emotion='neutral',cues){
      if(!enabled||engine!=='natural'||!natural||!text?.trim())return Promise.resolve(null);
      preparedAudio=audioFor(text,mode,emotion,cues);updateState();return preparedAudio.promise;
    },
    async speak(text, mode = 'companion', emotion = 'neutral', cues) {
      if (!enabled || !this.supported) return;
      const entry=engine==='natural'?audioFor(text,mode,emotion,cues):null;
      stopPlayback(entry); const version = generation;
      if(engine === 'natural') {
        currentAudio=entry;preparedAudio=null;updateState();
        let narrationStarted=false,finished=false;
        const finish=error=>{
          if(version!==generation||finished)return;
          finished=true;
          if(error||entry.loading)discard(entry);
          cleanup();currentAudio=null;updateState();onEnd?.();
          if(error&&error.name!=='AbortError')onError?.(error.message||'Natural voice could not play. Try Browser voice.');
        };
        const playClip=async index=>{
          try{
            const audio=await clipAt(entry,index);
            if(version!==generation||finished)return;
            if(!audio){finish(entry.error);return;}
            const {blob,envelope}=audio;
            objectUrl=urls.createObjectURL(blob);player=new AudioCtor(objectUrl);
            const clipPlayer=player,isCurrent=()=>version===generation&&!finished&&player===clipPlayer;
            if(prepareCapture()){
              audioSource=audioContext.createMediaElementSource(player);
              audioSource.connect(audioContext.destination);audioSource.connect(audioDestination);
            }
            player.onplaying=()=>{if(isCurrent()){
              mouthPlayback={envelope,timeline:speechTimeline(text),start:now()};updateState();
              if(!narrationStarted){narrationStarted=true;onStart?.();}
            }};
            player.onwaiting=player.onpause=()=>{if(isCurrent()&&mouthPlayback){mouthPlayback.active=false;setState('preparing');}};
            player.playbackRate=1.04*pace;player.preservesPitch=false;
            player.onended=()=>{if(isCurrent()){cleanup();updateState();void playClip(index+1);}};
            player.onerror=()=>{if(isCurrent())finish(Error('Natural voice could not play. Captions remain available; try Browser voice.'));};
            await player.play();
          }catch(error){finish(error);}
        };
        await playClip(0);
        return;
      }
      const voices = synth.getVoices();
      const preferred = voices.find(v=>v.name===browserName)||selectBrowserVoice(voices);
      const chunks=speechChunks(text);
      const baseRate=mode==='uncanny'||emotion==='sleepy'?.86:emotion==='happy'?1.04:emotion==='annoyed'?.98:1;
      const begin=index=>{
        if(version!==generation)return;
        const rate=baseRate*pace;
        const utterance=new SpeechSynthesisUtterance(chunks[index]);if(preferred)utterance.voice=preferred;
        currentUtterance=utterance;
        utterance.rate=rate;utterance.pitch=mode==='uncanny'?.97:emotion==='happy'?1.16:emotion==='annoyed'?1.04:1.1;
        utterance.onstart=()=>{if(version===generation&&currentUtterance===utterance){mouthPlayback={timeline:speechTimeline(chunks[index],rate),start:now()};updateState();onStart?.();}};
        utterance.onboundary=event=>{
          if(version!==generation||currentUtterance!==utterance||!mouthPlayback)return;
          if(event.name==='sentence'){mouthPlayback.boundary={start:now(),duration:0};return;}
          const word=chunks[index].slice(event.charIndex).match(/^[\p{L}\p{N}'’-]+/u)?.[0];
          mouthPlayback.boundary={start:now(),duration:word?Math.min(.6,.07+word.length*.038)/rate:0};
        };
        utterance.onend=()=>{if(version!==generation||currentUtterance!==utterance)return;currentUtterance=null;mouthPlayback=null;updateState();if(index+1<chunks.length)gapTimer=setTimeout(()=>begin(index+1),180);else onEnd?.();};
        utterance.onerror=event=>{if(version!==generation||currentUtterance!==utterance)return;cleanup();updateState();onEnd?.();if(!['canceled','interrupted'].includes(event.error))onError?.('Your browser could not speak that reply. The caption is still here.');};
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
