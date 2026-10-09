// Scroll targets for the existing NOX icon; R3F renders, GSAP interpolates.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smooth=t=>t*t*(3-2*t);
const desktop=[
  {screenX:.76,screenY:.46,size:.26,x:.06,y:-.32,z:-.06,spread:0,waterTurn:0,waterX:0,opacity:.9},
  {screenX:.23,screenY:.5,size:.25,x:-.04,y:.32,z:.07,spread:.1,waterTurn:-.18,waterX:-.4,opacity:.9},
  {screenX:.76,screenY:.5,size:.28,x:.02,y:-.3,z:-.03,spread:.5,waterTurn:.22,waterX:.4,opacity:.95},
  {screenX:.23,screenY:.51,size:.24,x:-.04,y:.3,z:.08,spread:0,waterTurn:.4,waterX:.1,opacity:.85},
  {screenX:.78,screenY:.75,size:.14,x:.08,y:-.22,z:.1,spread:0,waterTurn:.55,waterX:0,opacity:.2},
];
export function emblemChapter(scroll,anchors){
  const value=Number.isFinite(scroll)?scroll:0;let index=0;
  while(index<3&&value>=anchors[index+1]-8)index++;
  return index;
}
export function emblemPose(scroll,anchors,small=false){
  const stops=desktop.map((pose,index)=>small?{...pose,screenX:index%2?.5:.3,screenY:.76,size:index===4?.3:.43,opacity:index===4?.15:.55}:pose);
  const value=Number.isFinite(scroll)?scroll:0;let index=0;
  while(index<stops.length-1&&value>=anchors[index+1])index++;
  if(index===stops.length-1)return {...stops[index]};
  const span=Math.max(1,anchors[index+1]-anchors[index]),local=clamp((value-anchors[index])/span,0,1);
  // Dwell through the paragraph, then cross behind the outgoing chapter.
  const t=smooth(clamp((local-.55)/.45,0,1));
  const pose=Object.fromEntries(Object.keys(stops[index]).map(key=>[key,stops[index][key]+(stops[index+1][key]-stops[index][key])*t]));
  const crossing=Math.sin(t*Math.PI);
  pose.spread+=crossing*1.6;pose.z+=crossing*(index%2?.12:-.12);pose.size*=1+crossing*.06;
  return pose;
}
export function emblemPointer(pointer,pose){
  if(!pointer||![pointer.x,pointer.y].every(Number.isFinite))return {x:0,y:0};
  return {x:clamp((pointer.y-pose.screenY)*.25,-.1,.1),y:clamp((pointer.x-pose.screenX)*.32,-.16,.16)};
}
