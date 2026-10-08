// Local play state, independent of AI requests, stored history and provider keys.
const kinds=new Set(['poke','drag','shake','liquid','gravity','takeover','pout']);
const clamp=value=>Math.max(0,Math.min(1,value));
export function createDiscoveries(){const found=new Set();return {mark(kind){if(!kinds.has(kind)||found.has(kind))return false;found.add(kind);return true;},get count(){return found.size;},list(){return [...found];},has(kind){return found.has(kind);}};}
export function sceneIndex(progress){return Math.floor(clamp(Number.isFinite(progress)?progress:0)*3+.00001);}
export function createHoldGate(duration=900){let pointer=null,start=0,progress=0;const ms=Number.isFinite(duration)&&duration>0?duration:900;return {
  begin(id,now){if(pointer!==null||!Number.isFinite(now))return false;pointer=id;start=now;progress=0;return true;},
  advance(now){if(pointer===null)return {progress,complete:false};if(!Number.isFinite(now))return {progress,complete:false};progress=clamp((now-start)/ms);if(progress===1){pointer=null;return {progress,complete:true};}return {progress,complete:false};},
  cancel(id){if(pointer===null||pointer!==id)return false;pointer=null;progress=0;return true;},get active(){return pointer!==null;},
};}
