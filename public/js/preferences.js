export function readMotionPreference(storage, reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false) {
  return readMotionChoice(storage)??!reduced;
}
export function readMotionChoice(storage){try{const disk=storage||globalThis.localStorage;const saved=disk.getItem('nox.motion.v2')??disk.getItem('nox.motion.v1');return saved==='on'?true:saved==='off'?false:null;}catch{return null;}}
