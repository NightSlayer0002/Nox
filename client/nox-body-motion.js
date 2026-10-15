const clamp=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
const rest=()=>({Hold:0,WobbleLeft:0,WobbleRight:0,Impact:0});

// Body deformation only. Face/Stage retain physics, expression and speech ownership.
export function createBodyMotion(){
  let previous=null,hold=0,pull=0,wobble=0,releasedAt=-Infinity;
  return {sample(face,time){
    const x=Number.isFinite(face.x)?face.x:.5,y=Number.isFinite(face.y)?face.y:.46;
    const delta=previous?time-previous.time:0;
    if(!Number.isFinite(time)||face.reduceMotion||delta<0){
      previous=Number.isFinite(time)?{time,x,y,held:false}:null;hold=pull=wobble=0;releasedAt=-Infinity;return rest();
    }
    const dt=Math.min(.05,delta),held=Boolean(face.held);
    if(delta>.25){pull=wobble=0;releasedAt=-Infinity;if(!held)hold=0;}
    hold+=((held?.65:0)-hold)*(1-Math.exp(-dt*(held?12:8)));
    if(held&&previous&&dt>0&&delta<=.25){
      const horizontal=(x-previous.x)/delta,vertical=(y-previous.y)/delta;
      // A vertical release also wobbles; the last horizontal pull chooses its side.
      const drive=horizontal+Math.sign(pull||horizontal||1)*Math.abs(vertical)*.35;
      pull+=(Math.max(-1,Math.min(1,drive*.65))-pull)*(1-Math.exp(-dt*24));
    }else if(previous?.held&&!held){wobble=pull*.7;releasedAt=time;pull=0;}
    const age=time-releasedAt;
    const sway=age>=0&&age<2?wobble*Math.exp(-age*6)*Math.cos(age*17):0;
    const impactAge=time-face.impactAt;
    // Local front/side bulge complements, rather than repeats, Canvas impact squash.
    const impact=impactAge>=0&&impactAge<.38?Math.sin(impactAge/.38*Math.PI)*Math.exp(-impactAge*5)*clamp(face.impactStrength)*.65:0;
    previous={time,x,y,held};
    return {Hold:clamp(hold),WobbleLeft:clamp(-sway),WobbleRight:clamp(sway),Impact:clamp(impact)};
  }};
}
