const bounded=value=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
const profiles={
  face:{chrome:false,material:{color:'#26352d',metalness:.015,roughness:.85,clearcoat:.04,clearcoatRoughness:.8,sheen:.35,sheenColor:'#617969',sheenRoughness:.9},lights:[.9,2.8,.65,3.4],exposure:1.04},
  liquid:{chrome:true,material:{color:'#8daca6',metalness:.96,roughness:.22,clearcoat:.8,clearcoatRoughness:.16},lights:[2,4,3,3],exposure:.95}
};

export function appearanceProfile(appearance='liquid'){return profiles[appearance]||profiles.liquid;}

// The group carries body and expression together. Impact remains a local morph:
// Canvas already owns the whole-character landing squash.
export function appearancePose(appearance,weights={},reduceMotion=false){
  const morphs=Object.fromEntries(['Hold','WobbleLeft','WobbleRight','Impact'].map(name=>[name,reduceMotion?0:bounded(weights[name])]));
  if(appearance!=='face')return {scale:[1,1,1],rotation:0,morphs};
  const held=Math.min(1,morphs.Hold/.65),sway=morphs.WobbleRight-morphs.WobbleLeft;
  morphs.Hold*=.42;
  morphs.WobbleLeft=bounded(morphs.WobbleLeft*1.4);morphs.WobbleRight=bounded(morphs.WobbleRight*1.4);
  return {scale:[1-held*.045,1+held*.1,1],rotation:sway?-sway*.055:0,morphs};
}
