// The existing water material is the room itself. Inputs only steer its shape;
// they never change its palette, exposure or the interface's opacity.
const bounded=(value,min,max)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):0;
const approach=(value,target,dt,seconds)=>value+(target-value)*(1-Math.exp(-dt/seconds));
export function createTerrainMotion(){
  return {time:0,pointerX:0,pointerY:0,scroll:0,impulse:0,energy:0,x:0,y:0,turn:0,tiltX:0,tiltY:0,strength:3.6,density:1.12};
}
export function advanceTerrain(previous,input={},delta=0){
  const dt=bounded(delta,0,.1),reduced=Boolean(input.reduced);
  const pointerX=bounded(input.pointerX,-1,1),pointerY=bounded(input.pointerY,-1,1),scroll=bounded(input.scroll,0,1);
  const speaking=input.voice==='speaking'||input.activity==='speaking';
  const thinking=input.activity==='thinking',preparing=input.activity==='preparing'||input.voice==='preparing';
  const targetEnergy=Math.max(speaking?.85:thinking?.58:preparing?.45:input.activity==='listening'?.3:0,bounded(input.typing,0,1)*.28);
  const energy=reduced?targetEnergy:approach(previous.energy,targetEnergy,dt,.85);
  const px=reduced?pointerX:approach(previous.pointerX,pointerX,dt,.55),py=reduced?pointerY:approach(previous.pointerY,pointerY,dt,.55);
  const travel=reduced?scroll:approach(previous.scroll,scroll,dt,.75);
  const impulse=reduced?0:bounded(previous.impulse*Math.exp(-dt/.4)+bounded(input.scrollImpulse,-1,1),-1,1);
  // Cap elapsed time so a tab becoming visible cannot fast-forward the terrain.
  const time=previous.time+(reduced?0:dt*(1+energy*.45+Math.abs(impulse)*.15));
  return {
    time,pointerX:px,pointerY:py,scroll:travel,impulse,energy,
    // Broad, overlapping currents cross a visible distance in an eight-second
    // glance. They move the existing material, never its light or exposure.
    x:reduced?0:Math.sin(time*.19)*.28+Math.sin(time*.073)*.07+px*.18+travel*.12,
    y:reduced?0:Math.sin(time*.14)*.14+py*.065,
    turn:reduced?0:Math.sin(time*.13)*.045+px*.02+impulse*.008,
    tiltX:reduced?0:py*.035+Math.sin(time*.17)*.016,
    tiltY:reduced?0:px*.045+Math.sin(time*.11)*.012,
    strength:3.6+energy*(reduced?.06:.36)+py*(reduced?.012:.1)+(reduced?0:Math.sin(time*.35)*.19+impulse*.07),
    density:1.12+travel*.04+px*.025+energy*.04+(reduced?0:Math.sin(time*.21)*.075),
  };
}
