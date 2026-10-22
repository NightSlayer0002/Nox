// Scroll targets for the existing NOX icon; R3F renders, GSAP interpolates.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smooth=t=>t*t*t*(t*(t*6-15)+10);
// A full viewport of travel replaces the former visibility-triggered cut.
export function playgroundShade(rect,height){
  if(!Number.isFinite(rect?.top)||!Number.isFinite(height)||height<=0)return 0;
  return smooth(clamp((height*1.2-rect.top)/height,0,1));
}
const desktop=[
  {screenX:.75,screenY:.49,size:.34,x:.04,y:-.22,z:-.035,spread:0,waterTurn:0,waterX:0,opacity:1},
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
export function emblemPose(scroll,anchors,small=false,layout){
  const stops=desktop.map((pose,index)=>{
    if(!small)return pose;
    const phone={...pose,screenX:index%2?.24:.76,screenY:.28,size:.3,spread:pose.spread*.12,opacity:index===4?.15:.95};
    const slot=layout?.slots?.[index];
    if(slot&&layout.width>0&&layout.height>0){
      phone.screenX=(slot.left+slot.width/2)/layout.width;
      phone.screenY=clamp((slot.top+slot.height/2-scroll)/layout.height,.18,.64);
      phone.size=Math.min(.36,slot.width*.72/layout.width);
    }
    return phone;
  });
  const value=Number.isFinite(scroll)?scroll:0;let index=0;
  while(index<stops.length-1&&value>=anchors[index+1])index++;
  if(index===stops.length-1)return {...stops[index]};
  const span=Math.max(1,anchors[index+1]-anchors[index]),local=clamp((value-anchors[index])/span,0,1);
  // Anchors are visible copy centers. Start during the outgoing paragraph,
  // settle just before the incoming copy center; zero velocity at both ends.
  const t=smooth(clamp((local-.35)/.6,0,1));
  const pose=Object.fromEntries(Object.keys(stops[index]).map(key=>[key,stops[index][key]+(stops[index+1][key]-stops[index][key])*t]));
  const crossing=Math.sin(t*Math.PI);
  pose.spread+=crossing*(small?.1:1.6);pose.z+=crossing*(index%2?.12:-.12);pose.size*=1+crossing*(small?.02:.06);
  return pose;
}
export function emblemPointer(pointer,pose){
  if(!pointer||![pointer.x,pointer.y].every(Number.isFinite))return {x:0,y:0};
  return {x:clamp((pointer.y-pose.screenY)*.25,-.1,.1),y:clamp((pointer.x-pose.screenX)*.32,-.16,.16)};
}

// Position the existing full-size emblem relative to the finale's actual box.
// The body is a separate shared Stage portrait, never a second character.
export function finaleEmblemPose(rect,viewport,small=false){
  const width=Math.max(1,viewport.width||1),height=Math.max(1,viewport.height||1);
  return {screenX:(rect.left+rect.width*(small?.34:.27))/width,screenY:(rect.top+rect.height*.47)/height,size:rect.width/width*(small?.46:.28),x:.02,y:.18,z:-.04,spread:0,waterTurn:.55,waterX:0,opacity:small?.38:.48};
}
