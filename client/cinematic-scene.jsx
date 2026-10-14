// TubeGeometry construction and arclength travel adapted from the official
// Three.js webgl_geometry_extrude_splines example, retained with its MIT license
// in public/vendor/three-cinematic. Room composition and Stage handoff are NOX.
import React,{useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {createCinematicLoop} from '/js/cinematic-presence.js';

// Upstream's PipeSpline control points, recentered and scaled for this room.
const pipePoints=[[0,10,-10],[10,0,-10],[20,0,0],[30,0,10],[30,0,20],[20,0,30],[10,0,30],[0,0,30],[-10,10,30],[-10,20,30],[0,30,30],[10,30,30],[20,30,15],[10,30,10],[0,30,10],[-10,20,10],[-10,10,10],[0,0,10],[10,-10,10],[20,-15,10],[30,-15,10],[40,-15,10],[50,-15,10],[60,0,10],[70,0,0],[80,0,0],[90,0,0],[100,0,0]];
const clamp=value=>Math.max(0,Math.min(1,value));

function createRoom(host,landing,{onState}){
  const events=new AbortController();
  let renderer,scene,texture,resize,loop,disposed=false,failed=false;
  const dispose=()=>{
    if(disposed)return;disposed=true;loop?.dispose();landing.cinematic(false);events.abort();resize?.disconnect();
    scene?.traverse(object=>{object.geometry?.dispose();if(object.material){for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});
    texture?.dispose();renderer?.dispose();renderer?.domElement.remove();
  };
  try{
  const small=matchMedia('(max-width:700px)').matches;
  renderer=new THREE.WebGLRenderer({antialias:!small,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,small?1:1.25));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.domElement.tabIndex=0;
  renderer.domElement.setAttribute('role','button');
  renderer.domElement.setAttribute('aria-label','NOX drifting through the light. Click him or press Enter to greet; Space to wink.');
  host.appendChild(renderer.domElement);
  scene=new THREE.Scene();scene.background=new THREE.Color('#040809');scene.fog=new THREE.FogExp2('#071416',.062);
  const camera=new THREE.PerspectiveCamera(40,1,.1,70);camera.position.set(0,.8,12);camera.lookAt(0,0,0);
  const filaments=new THREE.Group();scene.add(filaments);
  const curves=[];
  for(let index=0;index<(small?5:8);index++){
    const offset=(index-(small?2:3.5))*.13;
    const points=pipePoints.map(([x,y,z])=>new THREE.Vector3((x-39)*.115,(y-7.5)*.115+offset,(z-10)*.115+offset*.8));
    const path=new THREE.CatmullRomCurve3(points);
    const group=new THREE.Group();group.rotation.set(.1+index*.018,-.13+index*.018,-.28+index*.012);group.position.x=-.5;
    // The official example's spline extrusion, with thin luminous materials.
    const geometry=new THREE.TubeGeometry(path,small?120:180,.012,4,false);
    const material=new THREE.MeshBasicMaterial({color:index%3===0?'#e7d7b0':'#90d8c9',transparent:true,opacity:.64,depthWrite:false,blending:THREE.AdditiveBlending});
    group.add(new THREE.Mesh(geometry,material));
    const haloGeometry=new THREE.TubeGeometry(path,small?90:140,.065,4,false);
    const haloMaterial=new THREE.MeshBasicMaterial({color:index%3===0?'#b8a584':'#6cbaad',transparent:true,opacity:.035,depthWrite:false,blending:THREE.AdditiveBlending});
    group.add(new THREE.Mesh(haloGeometry,haloMaterial));
    filaments.add(group);curves.push(group);
  }
  texture=new THREE.CanvasTexture(landing.stage.canvas);
  texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;
  const portrait=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,fog:false}));
  portrait.scale.set(1.5,1.5,1);portrait.renderOrder=2;scene.add(portrait);
  const drift=new THREE.CatmullRomCurve3([new THREE.Vector3(-3,.3,.7),new THREE.Vector3(-1.6,1,-.2),new THREE.Vector3(2.1,.55,.7),new THREE.Vector3(3,-.6,1),new THREE.Vector3(.1,-1.15,.5),new THREE.Vector3(-2.8,-.7,.2)],true);
  const target={x:.5,y:.5},smooth={x:.5,y:.5},raycaster=new THREE.Raycaster(),projection=new THREE.Vector2();
  const dimensions=()=>{
    const {width,height}=host.getBoundingClientRect();if(!width||!height)return;
    renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();
  };
  resize=new ResizeObserver(dimensions);resize.observe(host);dimensions();
  loop=createCinematicLoop({fps:small?20:24,presence:active=>{landing.cinematic(active);host.dataset.active=String(active);},render:({elapsed,dt,motion:animate})=>{
    if(disposed||failed)return;
    try{
    // Stage.reduceMotion includes its existing explicit NOX motion override.
    loop.setMotion(!landing.stage.reduceMotion);
    const amount=animate?1-Math.exp(-dt*4):1;
    smooth.x+=(target.x-smooth.x)*amount;smooth.y+=(target.y-smooth.y)*amount;
    const parallax=animate?1:0;
    camera.position.x=(smooth.x-.5)*.5*parallax;camera.position.y=.8-(smooth.y-.5)*.3*parallax;camera.lookAt(0,0,0);
    filaments.rotation.y=Math.sin(elapsed*.12)*.08;filaments.rotation.z=Math.sin(elapsed*.1)*.035;
    for(let index=0;index<curves.length;index++)curves[index].position.y=Math.sin(elapsed*.22+index*.2)*.08;
    drift.getPointAt((.2+elapsed*.012)%1,portrait.position);if(small)portrait.position.x*=.48;
    portrait.material.rotation=Math.sin(elapsed*.32)*.09;
    const aspect=landing.stage.canvas.width/Math.max(1,landing.stage.canvas.height);portrait.scale.set(1.5*aspect,1.5,1);
    texture.needsUpdate=true;renderer.render(scene,camera);
    renderer.domElement.dataset.frame=String(Math.round(elapsed*1000));renderer.domElement.dataset.character='shared-stage';
    }catch{failed=true;dispose();onState('fallback');}
  }});
  loop.setMotion(!landing.stage.reduceMotion);
  const nearPortrait=()=>{projection.set(target.x*2-1,1-target.y*2);raycaster.setFromCamera(projection,camera);return raycaster.intersectObject(portrait).length>0;};
  const pointer=event=>{
    if(event.pointerType==='touch')return;
    const box=host.getBoundingClientRect();target.x=clamp((event.clientX-box.left)/Math.max(1,box.width));target.y=clamp((event.clientY-box.top)/Math.max(1,box.height));
    landing.cinematicPointer(target);renderer.domElement.style.cursor=nearPortrait()?'pointer':'default';
  };
  renderer.domElement.addEventListener('pointermove',pointer,{passive:true,signal:events.signal});
  renderer.domElement.addEventListener('pointerleave',()=>{target.x=target.y=.5;landing.cinematicPointer(target);},{signal:events.signal});
  renderer.domElement.addEventListener('click',event=>{const box=host.getBoundingClientRect();target.x=clamp((event.clientX-box.left)/Math.max(1,box.width));target.y=clamp((event.clientY-box.top)/Math.max(1,box.height));if(nearPortrait())landing.poke();},{signal:events.signal});
  renderer.domElement.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();landing.poke();}if(event.key===' '){event.preventDefault();landing.stage.character.wink(landing.stage.time);}},{signal:events.signal});
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();failed=true;dispose();onState('fallback');},{signal:events.signal});
  const visibility=()=>loop.setPageVisible(!document.hidden);
  document.addEventListener('visibilitychange',visibility,{signal:events.signal});visibility();
  onState('ready');
  return {
    setVisible(value){if(!failed)loop.setVisible(value);},
    dispose,
  };
  }catch(error){dispose();throw error;}
}

export default function CinematicScene({landing}){
  const host=useRef(),room=useRef();
  const [state,setState]=useState('waiting');
  useEffect(()=>{
    if(!landing)return;
    let alive=true;
    const observer=new IntersectionObserver(entries=>{
      const visible=entries[0].isIntersecting;
      if(visible&&!room.current){
        try{room.current=createRoom(host.current,landing,{onState:value=>{if(alive)setState(value);}});}
        catch{landing.cinematic(false);if(alive)setState('fallback');}
      }
      room.current?.setVisible(visible);
    },{threshold:0});
    observer.observe(host.current);
    return()=>{alive=false;observer.disconnect();room.current?.dispose();room.current=null;landing.cinematic(false);};
  },[landing]);
  return <section className="cinematic-section" aria-labelledby="cinematic-title" data-state={state}>
    <div ref={host} className="cinematic-room"/>
    <div className="cinematic-atmosphere" aria-hidden="true"/>
    <h2 id="cinematic-title">A little room to wander.</h2>
    <div className="cinematic-foot"><p>Follow a thought. Say hello when he passes.</p><button type="button" onClick={()=>landing?.poke()} disabled={state!=='ready'}>Say hello to NOX</button></div>
  </section>;
}
