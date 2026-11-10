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

// Each playback owns a fresh media element. A late play promise can only stop
// its own obsolete element, never a newer purr or a user's resumed sound.
export function createCatSound({Audio=globalThis.Audio,onChange=()=>{},onError=()=>{}}={}){
  let enabled=false,hushed=false,disposed=false,current=null;
  const allowed=()=>enabled&&!hushed&&!disposed;
  function release(){if(!current)return;const node=current;current=null;node.onended=node.onerror=null;node.pause();node.removeAttribute?.('src');node.load?.();}
  function fail(node){if(current!==node||disposed)return;enabled=false;release();onChange(false);onError();}
  async function play(kind){
    release();if(!allowed())return;
    let node;
    try{
      node=new Audio(`/assets/calm/${kind}.wav`);current=node;
      node.loop=kind==='purr';node.volume=kind==='purr'?.12:.32;
      node.onerror=()=>fail(node);
      node.onended=()=>{if(current===node&&allowed()&&kind==='meow')void play('purr');};
      await node.play();
      if(current!==node||!allowed())node.pause();
    }catch{if(node)fail(node);else if(!disposed){enabled=false;onChange(false);onError();}}
  }
  return {
    async enable(value){if(disposed)return;enabled=Boolean(value);onChange(enabled);if(enabled)await play('purr');else release();},
    quiet(value){if(disposed||hushed===Boolean(value))return;hushed=Boolean(value);if(hushed)release();else if(enabled)void play('purr');},
    pet(){if(allowed())return play('meow');},
    dispose(){if(disposed)return;disposed=true;enabled=false;release();}
  };
}
