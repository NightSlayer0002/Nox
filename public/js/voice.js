// Browser voice is an optional layer. Text remains the source of truth.
import { wavEnvelope, envelopeAt, speechChunks, speechTimeline, timelineAt } from './speech-envelope.js';
import {createSpeechDeadline,SPEECH_PREPARATION_MS} from './speech-deadline.js';
export function selectBrowserVoice(voices) {
  const english = voices.filter(voice => voice.lang?.startsWith('en'));
  const male=english.filter(voice=>/\b(Guy|Christopher|Eric|David|Mark|Daniel|Alex|Tom|Fred|Ravi|Ryan|Andrew|Brian|George|James|Arthur|Oliver)\b|English Male/i.test(voice.name));
  return male.find(v=>/natural|neural|premium|enhanced/i.test(v.name))||male[0]
    || english.find(voice => /natural|neural|premium|enhanced/i.test(voice.name))
    || english.find(voice => !voice.localService)
    || english.find(voice => /Daniel|Guy|David/i.test(voice.name)) || english[0];
}
export function createVoice({ onStart, onEnd, onError, onState, onTiming, requestAudio, requestClips, AudioCtor = globalThis.Audio, AudioContextCtor=globalThis.AudioContext||globalThis.webkitAudioContext, urls = URL, now=()=>performance.now()/1000,preparationTimeoutMs=SPEECH_PREPARATION_MS,setTimer=setTimeout,clearTimer=clearTimeout } = {}) {
  let enabled = false, generation = 0, engine = 'browser', natural = false,speaker='troy',browserName='',pace=1;
  let mouthPlayback=null,gapTimer,currentUtterance=null,playbackTimer=null,playbackWatchVersion=0,releasePlaybackWait;
  let player, objectUrl, currentAudio=null, preparedAudio=null, state='idle',narration=null,latency=null;
  const audioCache=new Map();
  const milliseconds=(start,end)=>Math.max(0,Math.round((end-start)*1000));
  // Readiness and play() acceptance precede audible playback. Keep one measured
  // lifecycle per narration so a reply can reveal at the actual playback event.
  function beginNarration(entry,version,options,requestedAt){
    const narrationEngine=engine;
    let playRequestedAt,startedAt,finished=false;
    function report(status,reason,message){
      if(version!==generation)return;
      const readyAt=entry?.readyAt;
      latency=Object.freeze({engine:narrationEngine,status,
        preparationMs:entry?(readyAt===undefined?null:milliseconds(entry.requestedAt,readyAt)):0,
        audioReadyMs:entry?(readyAt===undefined?null:milliseconds(requestedAt,readyAt)):0,
        playbackWaitMs:startedAt===undefined?null:milliseconds(playRequestedAt,startedAt),
        totalMs:milliseconds(requestedAt,startedAt??now()),
        playbackMs:finished&&startedAt!==undefined?milliseconds(startedAt,now()):null,
        ...(reason?{reason}:{}),
        ...(message?{message}:{}),
      });
      onTiming?.(latency);return latency;
    }
    const lifecycle={
      requestPlayback(){if(finished||version!==generation||playRequestedAt!==undefined)return;playRequestedAt=now();report('starting');},
      start(){
        if(finished||version!==generation||startedAt!==undefined)return;
        startedAt=now();playRequestedAt??=startedAt;
        const timing=report('speaking');options?.onPlaybackStart?.(timing);
      },
      finish(error,reason='playback-error'){
        if(finished||version!==generation)return;
        finished=true;
        const unavailable=startedAt===undefined;
        const message=error?.message||error?.error;
        const result=report(unavailable?'unavailable':error?'error':'ended',error||unavailable?reason:undefined,message);
        if(narration===lifecycle)narration=null;
        if(unavailable)options?.onPlaybackUnavailable?.(result);
        else if(error)options?.onPlaybackError?.(result);
        else options?.onPlaybackEnd?.(result);
      },
      cancel(){if(finished)return;finished=true;report('cancelled');},
    };
    narration=lifecycle;report(entry?'preparing':'starting');return lifecycle;
  }
  function clearPlaybackWatchdog(){playbackWatchVersion++;if(playbackTimer!==null)clearTimer(playbackTimer);playbackTimer=null;}
  function watchPlayback(isCurrent,fail,progress,timeoutMs=15000){
    clearPlaybackWatchdog();
    const watchVersion=playbackWatchVersion;
    let previous=progress?.(),checkedAt=now();
    const check=()=>{
      if(watchVersion!==playbackWatchVersion||!isCurrent())return;playbackTimer=null;
      const value=progress?.();
      if(Number.isFinite(value)&&value>previous){previous=value;checkedAt=now();}
      const remaining=timeoutMs-(now()-checkedAt)*1000;
      if(remaining<=0){fail(Error('Voice playback stalled or timed out. The text is still available; try playing it again.'));return;}
      playbackTimer=setTimer(check,Math.min(1000,remaining));
      playbackTimer?.unref?.();
    };
    playbackTimer=setTimer(check,Math.min(1000,timeoutMs));playbackTimer?.unref?.();
  }
  const setState=value=>{if(state!==value){state=value;onState?.(value);}};
  function updateState(){
    if(mouthPlayback&&mouthPlayback.active!==false)setState('speaking');
    else if(currentAudio?.loading||preparedAudio?.status==='pending')setState('preparing');
    else if(currentAudio?.status==='ready'||preparedAudio?.status==='ready')setState('ready');
    else setState('idle');
  }
  const discard=entry=>{
    if(!entry)return;
    if(entry.loading){entry.deadline.cancel();entry.loading=false;entry.status='aborted';wake(entry);}
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
    const deadline=createSpeechDeadline({timeoutMs:preparationTimeoutMs,setTimer,clearTimer});
    entry={key,status:'pending',loading:true,clips:[],waiters:new Set(),controller:deadline.controller,deadline,requestedAt:now()};audioCache.set(key,entry);
    // Start the provider before returning, so history writes and rendering can overlap it.
    entry.promise=clipAt(entry,0);
    let iterator;
    entry.completion=(async()=>{
      const source=requestClips?await deadline.wait(requestClips(text,mode,entry.controller.signal,emotion,speaker,speechCues)):[{blob:await deadline.wait(requestAudio(text,mode,entry.controller.signal,emotion,speaker,speechCues))}];
      iterator=source[Symbol.asyncIterator]?.()||source[Symbol.iterator]();
      let size=0;
      while(true){
        const {done,value:clip}=await deadline.wait(iterator.next());if(done)break;
        if(entry.controller.signal.aborted)return;
        const blob=clip.blob;
        size+=blob.size;if(!blob.size||size>2*1024*1024||entry.clips.length>=4)throw Error('Natural voice returned invalid audio.');
        // MP3 cannot produce a WAV envelope; avoid copying the entire file just
        // to reject its header. Unknown types still retain the WAV sniffing path.
        const envelope=clip.envelope??(blob.type==='audio/mpeg'?null:wavEnvelope(await deadline.wait(blob.arrayBuffer())));
        if(entry.controller.signal.aborted)return;
        entry.readyAt??=now();
        entry.clips.push({blob,envelope});entry.status='ready';wake(entry);updateState();
      }
      if(!entry.clips.length)throw Error('Natural voice returned no audio.');
      entry.loading=false;wake(entry);updateState();
    })().catch(error=>{deadline.cancel();entry.error=error;entry.loading=false;entry.status='error';if(audioCache.get(key)===entry)audioCache.delete(key);wake(entry);updateState();}).finally(()=>{
      deadline.dispose();
      if(entry.controller.signal.aborted){try{void Promise.resolve(iterator?.return?.()).catch(()=>{});}catch{}}
    });
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
    clearPlaybackWatchdog();releasePlaybackWait?.();releasePlaybackWait=null;
    if(gapTimer!=null)clearTimer(gapTimer);gapTimer=null;mouthPlayback=null;currentUtterance=null;
    audioSource?.disconnect();audioSource=null;
    if(player) {player.onplaying = player.onended = player.onerror = player.onpause = player.onwaiting = null; player.pause(); player = null;}
    if(objectUrl) {urls.revokeObjectURL(objectUrl); objectUrl = null;}
  };
  const stopPlayback = retained => {
    narration?.cancel();narration=null;generation++;cleanup();
    for(const entry of audioCache.values())if(entry!==retained&&entry.loading)discard(entry);
    currentAudio=null;preparedAudio=retained||null;synth?.cancel();onEnd?.();updateState();
  };
  const stop=()=>{stopPlayback();preparedAudio=null;updateState();};
  return {
    get enabled() { return enabled; },
    get engine() { return engine; },
    get state() { return state; },
    get latency(){return latency;},
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
    async speak(text, mode = 'companion', emotion = 'neutral', cues, options) {
      const requestedAt=now();
      if (!enabled || !this.supported || !text?.trim()) {
        const lifecycle=beginNarration(null,generation,options,requestedAt);
        lifecycle.finish(null,!this.supported?'unsupported':!enabled?'disabled':'empty');return latency;
      }
      const entry=engine==='natural'?audioFor(text,mode,emotion,cues):null;
      stopPlayback(entry); const version = generation;
      const lifecycle=beginNarration(entry,version,options,requestedAt);
      if(engine === 'natural') {
        currentAudio=entry;preparedAudio=null;updateState();
        let narrationStarted=false,finished=false;
        const finish=(error,reason)=>{
          if(version!==generation||finished)return;
          finished=true;
          if(error||entry.loading)discard(entry);
          cleanup();currentAudio=null;updateState();lifecycle.finish(error,reason);onEnd?.();
          if(error&&error.name!=='AbortError')onError?.(error.message||'Natural voice could not play. Try Browser voice.');
        };
        const playClip=async index=>{
          try{
            const audio=await clipAt(entry,index);
            if(version!==generation||finished)return;
            if(!audio){finish(entry.error,entry.error?'provider-error':'no-playback');return;}
            const {blob,envelope}=audio;
            objectUrl=urls.createObjectURL(blob);player=new AudioCtor(objectUrl);
            const clipPlayer=player,isCurrent=()=>version===generation&&!finished&&player===clipPlayer;
            const failed=error=>finish(error,'playback-error');
            const stopped=new Promise(resolve=>{releasePlaybackWait=resolve;});
            if(prepareCapture()){
              audioSource=audioContext.createMediaElementSource(player);
              audioSource.connect(audioContext.destination);audioSource.connect(audioDestination);
            }
            player.onplaying=()=>{if(isCurrent()){
              mouthPlayback={envelope,timeline:speechTimeline(text),start:now()};updateState();
              watchPlayback(isCurrent,failed,()=>clipPlayer.currentTime||0);
              if(!narrationStarted){narrationStarted=true;lifecycle.start();onStart?.();}
            }};
            player.onwaiting=player.onpause=()=>{if(isCurrent()&&mouthPlayback){mouthPlayback.active=false;setState('preparing');}};
            player.playbackRate=1.04*pace;player.preservesPitch=false;
            player.onended=()=>{if(isCurrent()){cleanup();updateState();void playClip(index+1);}};
            player.onerror=()=>{if(isCurrent())finish(Error('Natural voice could not play. Captions remain available; try Browser voice.'));};
            lifecycle.requestPlayback();watchPlayback(isCurrent,failed);
            await Promise.race([player.play(),stopped]);
          }catch(error){finish(error);}
        };
        await playClip(0);
        return latency;
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
        const isCurrent=()=>version===generation&&currentUtterance===utterance;
        let boundary=-1;
        const fail=error=>{
          if(!isCurrent())return;
          cleanup();synth.cancel();updateState();lifecycle.finish(error);onEnd?.();
          onError?.(error.message||'Your browser could not speak that reply. The caption is still here.');
        };
        utterance.onstart=()=>{if(isCurrent()){mouthPlayback={timeline:speechTimeline(chunks[index],rate),start:now()};updateState();lifecycle.start();onStart?.();
          // Some engines omit word boundaries. Give each bounded utterance a
          // conservative speech-length allowance, extended by real boundaries.
          watchPlayback(isCurrent,fail,()=>boundary,Math.max(15000,chunks[index].length*200/rate+15000));
        }};
        utterance.onboundary=event=>{
          if(version!==generation||currentUtterance!==utterance||!mouthPlayback)return;
          if(Number.isFinite(event.charIndex))boundary=Math.max(boundary,event.charIndex);
          if(event.name==='sentence'){mouthPlayback.boundary={start:now(),duration:0};return;}
          const word=chunks[index].slice(event.charIndex).match(/^[\p{L}\p{N}'’-]+/u)?.[0];
          mouthPlayback.boundary={start:now(),duration:word?Math.min(.6,.07+word.length*.038)/rate:0};
        };
        utterance.onend=()=>{if(version!==generation||currentUtterance!==utterance)return;clearPlaybackWatchdog();currentUtterance=null;mouthPlayback=null;updateState();if(index+1<chunks.length)gapTimer=setTimer(()=>begin(index+1),180);else{lifecycle.finish();onEnd?.();}};
        utterance.onerror=event=>{if(version!==generation||currentUtterance!==utterance)return;cleanup();updateState();lifecycle.finish(event);onEnd?.();if(!['canceled','interrupted'].includes(event.error))onError?.('Your browser could not speak that reply. The caption is still here.');};
        try{lifecycle.requestPlayback();watchPlayback(isCurrent,fail);synth.speak(utterance);}catch(error){cleanup();updateState();lifecycle.finish(error);onEnd?.();onError?.('Your browser could not speak that reply. The caption is still here.');}
      };
      if(chunks.length)begin(0);
      return latency;
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
