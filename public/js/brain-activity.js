const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:0));
const regions=[[-.32,.22,.06],[.31,.14,-.06],[-.22,-.08,.18],[.2,.35,.1],[0,-.3,0]];
const kinds=new Set(['poke','drag','release','impact','speech','thinking','listening','idle']);

// Bounded artistic activity, driven by the existing stage/audio state. This
// does not invent a second animation loop or simulate biological neurons.
export class BrainActivity{
  constructor(){this.waveTime=0;this.waves=[];this.serial=0;this.drive=.12;this.previousAudio=0;this.lastAuto=0;this.lastSpeech=-1;this.lastKind=new Map();}
  emit(kind='poke',origin=[0,0,0],strength=1){
    if(!kinds.has(kind))kind='poke';
    if(this.waveTime-(this.lastKind.get(kind)??-1)<.045)return;
    this.lastKind.set(kind,this.waveTime);
    this.waves.push({origin:[0,1,2].map(i=>clamp(origin?.[i],-.8,.8)),startedAt:this.waveTime,strength:clamp(strength,0,1),kind});
    if(this.waves.length>8)this.waves.shift();this.serial++;
  }
  step(dt,{status='idle',audioLevel=0,reduceMotion=false}={}){
    const delta=clamp(dt,0,.05),audio=clamp(audioLevel,0,1);
    const target=status==='speaking'?audio:status==='thinking'?.62:status==='listening'?.36:.12;
    // Voice already supplies a smoothed audio envelope; preserve its gaps.
    if(status==='speaking')this.drive=target;
    else this.drive+=(target-this.drive)*(1-Math.exp(-delta*18));
    if(!reduceMotion){
      this.waveTime+=delta;this.waves=this.waves.filter(w=>this.waveTime-w.startedAt<2.7);
      if(status==='speaking'&&audio>.18&&this.waveTime-this.lastSpeech>.18&&(this.previousAudio<=.18||this.waveTime-this.lastSpeech>.38)){
        this.emit('speech',regions[this.serial%regions.length],.25+audio*.6);this.lastSpeech=this.waveTime;
      }
      const interval=status==='thinking'?.52:status==='listening'?.95:3.4;
      if(status!=='speaking'&&this.waveTime-this.lastAuto>=interval){
        this.emit(['thinking','listening'].includes(status)?status:'idle',regions[this.serial%regions.length],status==='thinking'?.55:status==='listening'?.35:.2);this.lastAuto=this.waveTime;
      }
    }
    this.previousAudio=audio;
    return {waveTime:this.waveTime,waves:this.waves,waveSerial:this.serial,drive:clamp(this.drive,0,1)};
  }
  clear(){this.waves=[];this.lastKind.clear();this.previousAudio=0;this.lastAuto=this.waveTime;this.lastSpeech=this.waveTime;}
}
