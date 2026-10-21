// Spline study: official Three.js PipeSpline. Tapered trails: pmndrs/meshline.
// Both MIT sources are recorded in public/vendor/sources.json.
import React,{useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {MeshLineGeometry,MeshLineMaterial} from 'meshline';
import {createCinematicLoop} from '/js/cinematic-presence.js';
import {createCinematicDynamics,CINEMATIC_MOTION} from '/js/cinematic-dynamics.js';
import {createCinematicAtmosphere} from './cinematic-atmosphere.js';

const pipePoints=[[0,10,-10],[10,0,-10],[20,0,0],[30,0,10],[30,0,20],[20,0,30],[10,0,30],[0,0,30],[-10,10,30],[-10,20,30],[0,30,30],[10,30,30],[20,30,15],[10,30,10],[0,30,10],[-10,20,10],[-10,10,10],[0,0,10],[10,-10,10],[20,-15,10],[30,-15,10],[40,-15,10],[50,-15,10],[60,0,10],[70,0,0],[80,0,0],[90,0,0],[100,0,0]];
const clamp=value=>Math.max(0,Math.min(1,value));

function createRoom(host,handle,portraitCanvas,orbCanvas,landing,{onState}){
  const events=new AbortController(),face=landing.stage.character;
  const small=matchMedia('(max-width:700px)').matches;
  const dynamics=createCinematicDynamics({x:small?.85:2.5,y:.15,vx:CINEMATIC_MOTION.initialVx,vy:CINEMATIC_MOTION.initialVy,maxSpeed:CINEMATIC_MOTION.maxSpeed});
  const portraitContext=portraitCanvas.getContext('2d');
  let renderer,scene,atmosphere,resize,loop,disposed=false,failed=false,held=null,started=null;
  const release=(cancel=false,time=performance.now())=>{
    if(held===null)return;
    const id=held;held=null;dynamics.release(time,{cancel});
    face.setHeld(false,landing.stage.time);face.release(landing.stage.time,{cancelled:cancel});
    handle.dataset.dragging='false';
    if(handle.hasPointerCapture(id))handle.releasePointerCapture(id);
  };
  const dispose=()=>{
    if(disposed)return;disposed=true;release(true);loop?.dispose();landing.cinematic(false);
    events.abort();resize?.disconnect();handle.hidden=true;portraitCanvas.hidden=true;atmosphere?.dispose();
    scene?.traverse(object=>{object.geometry?.dispose();if(object.material)for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();});
    renderer?.dispose();renderer?.domElement.remove();
  };
  try{
    // Transparent: the real scrolling NOX emblem remains the room's backdrop.
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
    renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-hidden','true');host.appendChild(renderer.domElement);
    scene=new THREE.Scene();
    const camera=new THREE.OrthographicCamera(-6,6,3.5,-3.5,.1,50);camera.position.z=12;
    atmosphere=createCinematicAtmosphere(renderer,camera,orbCanvas,small);
    const resolution=new THREE.Vector2(1,1),guides=new THREE.Group();scene.add(guides);
    const lineMaterials=[];
    // Sparse depth contours, rather than the former bundle across the copy.
    for(let index=0;index<(small?2:3);index++){
      const path=new THREE.CatmullRomCurve3(pipePoints.map(([x,y,z])=>new THREE.Vector3((x-40)*.14,(y-8)*.14,(z-10)*.12)));
      const geometry=new MeshLineGeometry();geometry.setPoints(path.getPoints(small?180:280),p=>Math.sin(Math.PI*p)*.75+.05);
      const material=new MeshLineMaterial({color:new THREE.Color('#a1bdb6'),lineWidth:.012,transparent:true,opacity:.12,resolution,sizeAttenuation:1,depthWrite:false});
      const contour=new THREE.Mesh(geometry,material);contour.rotation.set(.15+index*.38,-.2+index*.3,-.55+index*.8);contour.position.set(index*1.5-2.3,-.3,-2-index);
      guides.add(contour);lineMaterials.push(material);
    }
    // The shared Stage is copied once to an alpha canvas for a silhouette glow.
    // There is no duplicate Face or second visible portrait underneath it.
    const portrait=new THREE.Object3D();scene.add(portrait);
    const trail=new MeshLineGeometry(),trailCount=small?48:72;
    const initial=new Float32Array(trailCount*3);
    for(let i=0;i<trailCount;i++){const age=1-i/(trailCount-1);initial[i*3]=dynamics.state.x-age*1.8;initial[i*3+1]=dynamics.state.y+Math.sin(age*2.6)*.15;initial[i*3+2]=-.12;}
    // MeshLine's native variable-width strip and allocation-free advance API.
    trail.setPoints(initial,p=>p*p*.95+.005);
    for(const [width,opacity,color] of [[.5,.14,'#a7bab6']]){
      const material=new MeshLineMaterial({color:new THREE.Color(color),lineWidth:width,transparent:true,opacity,resolution,sizeAttenuation:1,depthWrite:false,depthTest:false});
      const ribbon=new THREE.Mesh(trail,material);ribbon.frustumCulled=false;ribbon.renderOrder=1;scene.add(ribbon);lineMaterials.push(material);
    }
    const target={x:.5,y:.5},smooth={x:.5,y:.5},projected=new THREE.Vector3(),tailPoint=new THREE.Vector3();
    const plane=new THREE.Plane(new THREE.Vector3(0,0,1),0),raycaster=new THREE.Raycaster(),ndc=new THREE.Vector2(),intersection=new THREE.Vector3();
    let width=1,height=1,halfWidth=6,tailAt=-1;
    const dimensions=()=>{
      const box=host.getBoundingClientRect();if(!box.width||!box.height)return;
      width=box.width;height=box.height;halfWidth=3.5*width/height;
      renderer.setSize(width,height);resolution.set(width,height);
      atmosphere.resize(width,height);
      for(const material of lineMaterials)material.resolution.copy(resolution);
      camera.left=-halfWidth;camera.right=halfWidth;camera.updateProjectionMatrix();
      dynamics.setBounds({left:-halfWidth+.8,right:halfWidth-.8,bottom:-2.55,top:2.55});
    };
    resize=new ResizeObserver(dimensions);resize.observe(host);dimensions();
    const worldPoint=event=>{
      const box=host.getBoundingClientRect();target.x=clamp((event.clientX-box.left)/Math.max(1,box.width));target.y=clamp((event.clientY-box.top)/Math.max(1,box.height));
      ndc.set(target.x*2-1,1-target.y*2);raycaster.setFromCamera(ndc,camera);raycaster.ray.intersectPlane(plane,intersection);
      return {x:intersection.x,y:intersection.y};
    };
    const noticePointer=point=>landing.cinematicPointer({x:.5+(point.x-dynamics.state.x)*.25,y:.5-(point.y-dynamics.state.y)*.25});
    loop=createCinematicLoop({fps:small?30:60,presence:active=>{
      if(!active)release(true);
      landing.cinematic(active);host.dataset.active=String(active);
    },render:({elapsed,dt,motion:animate})=>{
      if(disposed||failed)return;
      try{
        loop.setMotion(!landing.stage.reduceMotion);
        const state=dynamics.step(animate?dt:0),amount=1-Math.exp(-dt*10);
        smooth.x+=(target.x-smooth.x)*amount;smooth.y+=(target.y-smooth.y)*amount;
        camera.position.x=(smooth.x-.5)*.16;camera.position.y=(.5-smooth.y)*.1;camera.updateMatrixWorld();
        guides.rotation.y=Math.sin(elapsed*.07)*.07;guides.rotation.z=Math.sin(elapsed*.06)*.025;
        portrait.position.set(state.x,state.y,0);
        const rotation=state.dragging?Math.max(-.16,Math.min(.16,state.vx*.06)):Math.sin(elapsed*.8)*.045;
        const aspect=landing.stage.canvas.width/Math.max(1,landing.stage.canvas.height);portrait.scale.set(1.9*aspect,1.9,1);
        // A fixed time cadence gives the ribbon the same lifetime on phones.
        if(elapsed-tailAt>=1/30){tailPoint.set(state.x,state.y,-.12);trail.advance(tailPoint);tailAt=elapsed;}
        atmosphere.render(elapsed);renderer.render(scene,camera);
        projected.copy(portrait.position).project(camera);
        const portraitWidth=portrait.scale.x/(halfWidth*2)*width,portraitHeight=portrait.scale.y/7*height;
        const centerX=(projected.x+1)*width/2,centerY=(1-projected.y)*height/2;
        const stageCanvas=landing.stage.canvas;
        if(portraitCanvas.width!==stageCanvas.width||portraitCanvas.height!==stageCanvas.height){portraitCanvas.width=stageCanvas.width;portraitCanvas.height=stageCanvas.height;}
        portraitContext.clearRect(0,0,portraitCanvas.width,portraitCanvas.height);portraitContext.drawImage(stageCanvas,0,0);
        portraitCanvas.style.width=portraitWidth+'px';portraitCanvas.style.height=portraitHeight+'px';
        portraitCanvas.style.transform='translate('+(centerX-portraitWidth/2)+'px,'+(centerY-portraitHeight/2)+'px) rotate('+(-rotation)+'rad)';
        portraitCanvas.hidden=false;
        const handleWidth=portraitWidth*.88,handleHeight=portraitHeight*.88;
        handle.style.width=handleWidth+'px';handle.style.height=handleHeight+'px';
        handle.style.transform='translate('+(centerX-handleWidth/2)+'px,'+(centerY-handleHeight/2)+'px)';
        handle.hidden=false;
        renderer.domElement.dataset.frame=String(Math.round(elapsed*1000));renderer.domElement.dataset.character='shared-stage';
        renderer.domElement.dataset.x=state.x.toFixed(3);renderer.domElement.dataset.y=state.y.toFixed(3);
        renderer.domElement.dataset.speed=Math.hypot(state.vx,state.vy).toFixed(3);renderer.domElement.dataset.maxSpeed=String(CINEMATIC_MOTION.maxSpeed);
      }catch{failed=true;dispose();onState('fallback');}
    }});
    loop.setMotion(!landing.stage.reduceMotion);
    host.addEventListener('pointermove',event=>{if(held===null)noticePointer(worldPoint(event));},{passive:true,signal:events.signal});
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0||held!==null)return;
      const point=worldPoint(event);if(!dynamics.grab(point,event.timeStamp))return;
      held=event.pointerId;started={x:event.clientX,y:event.clientY,distance:0};handle.setPointerCapture(held);handle.dataset.dragging='true';
      face.setHeld(true,landing.stage.time);face.beginDrag(started,landing.stage.time);
    },{signal:events.signal});
    handle.addEventListener('pointermove',event=>{
      if(held===null){noticePointer(worldPoint(event));return;}
      if(event.pointerId!==held)return;dynamics.drag(worldPoint(event),event.timeStamp);
      started.distance=Math.max(started.distance,Math.hypot(event.clientX-started.x,event.clientY-started.y));
      face.moveDrag({x:event.clientX,y:event.clientY},landing.stage.time);
      noticePointer(worldPoint(event));
    },{signal:events.signal});
    handle.addEventListener('pointerup',event=>{
      if(event.pointerId!==held)return;
      const click=started.distance<6&&Math.hypot(event.clientX-started.x,event.clientY-started.y)<6;
      release(false,event.timeStamp);if(click)landing.poke();
    },{signal:events.signal});
    for(const type of ['pointercancel','lostpointercapture'])handle.addEventListener(type,()=>release(true),{signal:events.signal});
    handle.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();landing.poke();}
      else if(event.key===' '){event.preventDefault();face.wink(landing.stage.time);}
      else if(event.key==='Escape'){release(true);dynamics.state.vx=dynamics.state.vy=0;}
      else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
        event.preventDefault();const state=dynamics.state;
        // Use the same sampler and cap as pointer throws, including diagonals.
        const x=state.x,y=state.y,now=performance.now(),dx=event.key==='ArrowLeft'?-.1:event.key==='ArrowRight'?.1:0,dy=event.key==='ArrowUp'?.1:event.key==='ArrowDown'?-.1:0;
        dynamics.grab({x,y},now-50);dynamics.drag({x:x+dx,y:y+dy},now);dynamics.release(now);
      }
    },{signal:events.signal});
    renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();failed=true;dispose();onState('fallback');},{signal:events.signal});
    const visibility=()=>loop.setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange',visibility,{signal:events.signal});visibility();
    window.addEventListener('blur',()=>release(true),{signal:events.signal});
    onState('ready');
    return {setVisible(value){if(!failed)loop.setVisible(value);},dispose};
  }catch(error){dispose();throw error;}
}

export default function CinematicScene({landing,onLayout}){
  const section=useRef(),host=useRef(),handle=useRef(),portrait=useRef(),orbs=useRef(),room=useRef();
  const [state,setState]=useState('waiting');
  useEffect(()=>{
    if(!onLayout)return;
    const resize=new ResizeObserver(onLayout);resize.observe(section.current);
    return()=>resize.disconnect();
  },[onLayout]);
  useEffect(()=>{
    host.current.dataset.bound=String(Boolean(landing));
    if(!landing)return;let alive=true;
    const observer=new IntersectionObserver(entries=>{
      const visible=entries[0].isIntersecting;
      host.current.dataset.intersection=String(visible);
      if(visible&&!room.current)try{room.current=createRoom(host.current,handle.current,portrait.current,orbs.current,landing,{onState:value=>{if(alive)setState(value);}});}catch{landing.cinematic(false);if(alive)setState('fallback');}
      room.current?.setVisible(visible);
    },{threshold:0});
    observer.observe(host.current);
    return()=>{alive=false;observer.disconnect();room.current?.dispose();room.current=null;landing.cinematic(false);};
  },[landing]);
  return <section ref={section} id="wander" className="cinematic-section" aria-labelledby="cinematic-title" data-state={state}>
    <header className="cinematic-heading"><h2 id="cinematic-title">Before you go, let him fly.</h2><p>One small NOX. A little space to play.</p></header>
    <div className="cinematic-viewport">
      <canvas ref={orbs} className="cinematic-orbs" aria-hidden="true"/>
      <div ref={host} className="cinematic-room"/>
      <div className="cinematic-atmosphere" aria-hidden="true"/>
      <canvas ref={portrait} className="cinematic-nox-portrait" hidden aria-hidden="true"/>
      <button ref={handle} className="cinematic-nox-handle" type="button" hidden aria-label="NOX in zero gravity. Drag and release to throw. Arrow keys to nudge, Enter to greet, Space to wink, Escape to stop." aria-describedby="cinematic-help"/>
      <div className="cinematic-foot"><p id="cinematic-help">Grab him. Let go. He’ll find his way.</p><span>ZERO GRAVITY</span></div>
    </div>
  </section>;
}
