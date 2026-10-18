// Export dimensions stay independent of the size or pixel density of the preview.
export const EXPORT_PROFILES = Object.freeze([
  Object.freeze({id:'landscape',label:'Landscape',width:1280,height:720,aspectRatio:'16:9',frameRate:30,videoBitsPerSecond:5000000}),
  Object.freeze({id:'portrait',label:'Portrait',width:720,height:1280,aspectRatio:'9:16',frameRate:30,videoBitsPerSecond:5000000}),
  Object.freeze({id:'square',label:'Square',width:1080,height:1080,aspectRatio:'1:1',frameRate:30,videoBitsPerSecond:6000000}),
]);
export const DEFAULT_EXPORT_PROFILE = EXPORT_PROFILES[0];

export function resolveExportProfile(value=DEFAULT_EXPORT_PROFILE) {
  const id=typeof value==='string'?value:value?.id;
  const profile=EXPORT_PROFILES.find(option=>option.id===id);
  if(!profile)throw new RangeError('Choose a supported export profile.');
  if(typeof value==='object'&&['width','height','frameRate'].some(key=>value[key]!==undefined&&value[key]!==profile[key])) {
    throw new RangeError('Export profile dimensions and frame rate cannot be overridden.');
  }
  return profile;
}
