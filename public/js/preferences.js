export function readMotionPreference(storage) {
  try {const disk=storage||globalThis.localStorage;return (disk.getItem('nox.motion.v2')??disk.getItem('nox.motion.v1'))!=='off';}
  catch{return true;}
}
