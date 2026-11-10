const key='nox.calm.v1';
export function readCalmMode(storage){try{return (storage||globalThis.localStorage).getItem(key)==='true';}catch{return false;}}
export function saveCalmMode(value,storage){try{(storage||globalThis.localStorage).setItem(key,String(Boolean(value)));}catch{}return Boolean(value);}
export function catPerch({support,width,height,size,travel=0}){
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  // The Blender camera leaves four transparent pixels below the paw line.
  const feet=size*60/64;
  return {
    x:clamp(support.left+12+travel,Math.max(8,support.left+8),Math.min(width-size-8,support.right-size-8)),
    y:clamp(support.top-feet,8,height-size-8)
  };
}

// A continuous purr and a single short cue have independent ownership. A late
// play promise can only stop its own obsolete element. Mute/voice take priority
// over decorative fades and release both channels immediately.
export function createCatSound({Audio=globalThis.Audio,onChange=()=>{},onError=()=>{}}={}){
  let enabled=false,hushed=false,disposed=false,bed=null,cue=null,pose='idle',petCount=0;
  const fades=new Map();
  const allowed=()=>enabled&&!hushed&&!disposed;
  function release(node){
    if(!node)return;
    clearTimeout(fades.get(node));fades.delete(node);
    if(bed===node)bed=null;if(cue===node)cue=null;
    node.onended=node.onerror=null;node.pause();node.removeAttribute?.('src');node.load?.();
  }
  function stop(){release(cue);release(bed);}
  function fail(node){if(disposed||node!==bed&&node!==cue)return;enabled=false;stop();onChange(false);onError();}
  function fade(node,target){
    if(!node)return;clearTimeout(fades.get(node));
    const start=node.volume;let step=0;
    const tick=()=>{
      if(!allowed()||node!==bed&&node!==cue){fades.delete(node);return;}
      const t=++step/12;node.volume=start+(target-start)*t*t*(3-2*t);
      if(step<12)fades.set(node,setTimeout(tick,50));else fades.delete(node);
    };
    fades.set(node,setTimeout(tick,50));
  }
  const purrLevel=()=>cue ? .035 : pose==='sleeping1' ? .075 : pose==='nuzzle' ? .16 : .11;
  async function play(kind){
    if(!allowed()||kind==='purr'&&bed||kind!=='purr'&&cue)return;
    let node;
    try{
      const isPurr=kind==='purr';
      node=new Audio(`/assets/calm/${isPurr?'purr-soft':kind}.wav`);
      if(isPurr)bed=node;else cue=node;
      node.loop=isPurr;node.volume=isPurr?0:.27;
      if(!isPurr)fade(bed,purrLevel());
      node.onerror=()=>fail(node);
      node.onended=()=>{if(node!==cue)return;release(node);if(allowed())fade(bed,purrLevel());};
      await node.play();
      if(node!==bed&&node!==cue||!allowed())node.pause();
      else if(isPurr)fade(node,purrLevel());
    }catch{if(node)fail(node);else if(!disposed){enabled=false;stop();onChange(false);onError();}}
  }
  return {
    async enable(value){if(disposed)return;enabled=Boolean(value);onChange(enabled);if(enabled)await play('purr');else stop();},
    quiet(value){if(disposed||hushed===Boolean(value))return;hushed=Boolean(value);if(hushed)stop();else if(enabled)void play('purr');},
    mood(value){pose=value;if(allowed())fade(bed,purrLevel());},
    pet(){if(allowed()&&!cue)return play(petCount++%2?'mew-soft':'mew-hello');},
    dispose(){if(disposed)return;disposed=true;enabled=false;stop();}
  };
}
