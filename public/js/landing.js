import { Stage } from './stage.js';
import { readMotionPreference } from './preferences.js';
const stage=new Stage(document.getElementById('landing-stage'),null,{landing:true});
stage.setMotion(readMotionPreference());const phone=matchMedia('(max-width:650px)').matches;stage.character.x=stage.character.targetX=phone?.6:.76;stage.character.y=stage.character.targetY=phone?.73:.65;stage.character.scale=phone?.85:.45;
document.querySelectorAll('[data-greet]').forEach(link=>link.addEventListener('pointerenter',()=>stage.character.poke(stage.time)));
document.getElementById('landing-stage').addEventListener('dblclick',()=>stage.character.wink(stage.time));
setInterval(()=>{stage.canvas.dataset.gazeX=stage.character.gazeX.toFixed(2);stage.canvas.dataset.gazeY=stage.character.gazeY.toFixed(2);},150);
