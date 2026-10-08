const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
// Bounded rotation for the R3F demo adaptation. Spring owns the interpolation;
// this controller only computes finite targets and exclusive pointer ownership.
export function createLogoGesture(){
  let pointer=null,origin,base,angles={x:0,y:0};
  return {
    get active(){return pointer!==null;},get angles(){return {...angles};},
    begin(id,x,y){if(pointer!==null||![id,x,y].every(Number.isFinite))return false;pointer=id;origin={x,y};base={...angles};return true;},
    move(id,x,y){if(pointer!==id||![x,y].every(Number.isFinite))return false;angles={x:clamp(base.x+(y-origin.y)*.0045,-.45,.45),y:clamp(base.y+(x-origin.x)*.006,-.9,.9)};return true;},
    end(id){if(pointer!==id)return false;pointer=null;return true;},
    turn(amount){if(pointer!==null||!Number.isFinite(amount))return false;angles.y=clamp(angles.y+amount,-.9,.9);return true;},
    reset(){pointer=null;angles={x:0,y:0};}
  };
}

// Resource readiness and primary context health are independent. Async shader
// completion may update readiness while loss keeps the visible state fallback.
export function createLogoReadiness(onChange){
  let phase='loading',lost=false,sent='loading';
  const status=()=>lost?'fallback':phase;
  const publish=()=>{const next=status();if(next!==sent){sent=next;onChange(next);}};
  return {
    get status(){return status();},
    setPhase(next){if(!['loading','solid','metal','fallback'].includes(next))return false;phase=next;publish();return true;},
    lose(){lost=true;publish();},restore(){lost=false;publish();}
  };
}
