import { Stage } from './stage.js';
import { readMotionPreference } from './preferences.js';
import { attachPeek } from './peek.js';
const stage=new Stage(document.getElementById('landing-stage'),null,{landing:true});
stage.setMotion(readMotionPreference());
const layout=matchMedia('(max-width:650px)');
function placeHome(){stage.character.x=stage.character.targetX=layout.matches?.6:.76;stage.character.y=stage.character.targetY=layout.matches?.73:.65;stage.character.scale=layout.matches?.85:.45;}
placeHome();layout.addEventListener('change',placeHome);
attachPeek(stage,document.getElementById('nox-peek'),document.getElementById('peek-stage'));
document.querySelectorAll('[data-greet]').forEach(link=>link.addEventListener('pointerenter',()=>stage.character.poke(stage.time)));
document.getElementById('landing-stage').addEventListener('dblclick',()=>stage.character.wink(stage.time));
setInterval(()=>{stage.canvas.dataset.gazeX=stage.character.gazeX.toFixed(2);stage.canvas.dataset.gazeY=stage.character.gazeY.toFixed(2);},150);
