import { Stage } from './stage.js';

// Scroll supplies pose targets; Stage retains gesture, gravity and material physics.
export function createLanding(canvas,{onDiscover,onExpression,onScene}={}){
  const stage=new Stage(canvas,onScene,{landing:true,transparent:true});
  stage.setMotion(true);
  const pose={x:.7,y:.53,size:.34};
  let manual=false,expression='';
  stage.character.x=stage.character.targetX=pose.x;
  stage.character.y=stage.character.targetY=pose.y;
  stage.onGesture=kind=>{if(kind==='drag')manual=true;onDiscover?.(kind);};
  stage.onBeforeFrame=()=>{
    if(stage.dragging&&stage.dragDistance>=6)manual=true;
    if(!manual&&!stage.dragging&&!stage.scene){
      stage.character.targetX=pose.x;stage.character.targetY=pose.y;
      const size=Math.min(460,stage.width*pose.size);
      stage.character.scale=size/(270*Math.min(stage.width/720,stage.height/560));
    }
  };
  stage.onAfterFrame=()=>{
    const next=stage.character.features(stage.time).expression;
    canvas.dataset.gazeX=stage.character.gazeX.toFixed(2);
    canvas.dataset.gazeY=stage.character.gazeY.toFixed(2);
    canvas.dataset.expression=next;canvas.dataset.material=stage.form;
    if(next!==expression){expression=next;onExpression?.(next);if(next==='dizzy')onDiscover?.('shake');if(next==='pout')onDiscover?.('pout');}
  };
  return {
    stage,pose,
    chapter(){if(!stage.dragging&&stage.scene?.action!=='gravity')manual=false;},
    poke(){stage.character.poke(stage.time);onDiscover?.('poke');},
    material(metal){stage.setForm(metal?'liquid':'face');if(metal)onDiscover?.('liquid');},
    run(action){manual=false;if(stage.scene?.action===action){stage.stopScene(action);return;}stage.run(action);onDiscover?.(action);},
    home(){manual=false;stage.reset();},
    dispose(){stage.dispose();}
  };
}
