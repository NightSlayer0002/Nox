// Device hints are used locally for rendering; they are never sent to a model.
export function brainQuality({width=globalThis.innerWidth,memory=globalThis.navigator?.deviceMemory}={}){
  const compact=(Number.isFinite(width)&&width>0&&width<700)||(Number.isFinite(memory)&&memory>0&&memory<=4);
  return compact?{size:384,nodes:2000,edges:5000,interval:1/24}:{size:512,nodes:4200,edges:11000,interval:1/30};
}
