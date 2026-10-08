import { Stage } from './stage.js';
import { readMotionPreference } from './preferences.js';
import { attachPeek } from './peek.js';

const canvas=document.getElementById('landing-stage');
if(canvas){
  const stage=new Stage(canvas,null,{landing:true,transparent:true});
  function placeHome(){stage.character.x=stage.character.targetX=.78;stage.character.y=stage.character.targetY=.62;stage.character.scale=.83;}
  stage.setMotion(readMotionPreference());placeHome();
  document.addEventListener('nox:material',event=>stage.setForm(event.detail));
  attachPeek(stage,document.getElementById('nox-peek'),document.getElementById('peek-stage'));
  document.querySelectorAll('[data-greet]').forEach(link=>link.addEventListener('pointerenter',()=>stage.character.poke(stage.time)));
  const previous=stage.onAfterFrame;
  stage.onAfterFrame=()=>{previous?.();canvas.dataset.gazeX=stage.character.gazeX.toFixed(2);canvas.dataset.gazeY=stage.character.gazeY.toFixed(2);canvas.dataset.expression=stage.character.features(stage.time).expression;};
}
