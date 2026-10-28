// SphereGeometry / transparent MeshPhysicalMaterial adapted from the official
// Three.js transmission example pinned in public/vendor/sources.json.
import * as THREE from 'three';
import {createFrameBudget} from '/js/source-effects.js';

export function createCinematicAtmosphere(renderer,camera,canvas,small){
  const scene=new THREE.Scene(),ctx=canvas.getContext('2d');
  const geometry=new THREE.SphereGeometry(1,24,16);
  scene.add(new THREE.HemisphereLight('#c6ddd6','#11191b',1.5));
  const key=new THREE.DirectionalLight('#dde9e2',3);key.position.set(-3,5,4);scene.add(key);
  const rim=new THREE.DirectionalLight('#7ea9a2',1.2);rim.position.set(4,0,3);scene.add(rim);
  const layout=[
    {x:.04,y:.49,r:.4,a:.15},
    {x:.48,y:1.02,r:.88,a:.2},
    {x:.94,y:.98,r:1.45,a:.11},
    {x:.73,y:.07,r:1.04,a:.3},
    {x:.59,y:.69,r:.39,a:.2},
  ];
  const selected=small?[layout[1],layout[3],layout[4]]:layout;
  const orbs=selected.map((base,index)=>{
    const material=new THREE.MeshPhysicalMaterial({color:'#6f8582',metalness:.08,roughness:.37,clearcoat:1,clearcoatRoughness:.48,transparent:true,opacity:base.a,depthWrite:false});
    const mesh=new THREE.Mesh(geometry,material);mesh.scale.setScalar(base.r);scene.add(mesh);
    return {mesh,base,phase:index*1.8};
  });
  let width=1,height=1,previous,disposed=false,due=createFrameBudget(15);
  const visibilityTarget=globalThis.document,resetFrames=()=>{due=createFrameBudget(15);previous=undefined;};
  visibilityTarget?.addEventListener?.('visibilitychange',resetFrames);
  renderer.domElement.addEventListener?.('webglcontextrestored',resetFrames);
  return {
    resize(w,h){width=w;height=h;canvas.width=Math.max(1,Math.round(w*.65));canvas.height=Math.max(1,Math.round(h*.65));},
    render(time){
      if(disposed)return;
      if(visibilityTarget?.hidden){resetFrames();return;}
      // Restart after missed callbacks rather than carrying a render backlog.
      if(time-previous>2/15)resetFrames();
      if(Number.isFinite(time))previous=time;
      if(!due(time*1000))return;
      const halfWidth=3.5*width/height;
      for(const {mesh,base,phase} of orbs){
        mesh.position.set((base.x-.5)*halfWidth*2+Math.sin(time*.12+phase)*.11,(base.y-.5)*7+Math.cos(time*.1+phase)*.1,-2);
        mesh.rotation.y=time*.04;
      }
      // Reuse the room's WebGL context. Only this low-frequency sphere layer
      // is copied to a smaller canvas and defocused; text and NOX stay sharp.
      renderer.render(scene,camera);ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(renderer.domElement,0,0,canvas.width,canvas.height);
    },
    dispose(){if(disposed)return;disposed=true;visibilityTarget?.removeEventListener?.('visibilitychange',resetFrames);renderer.domElement.removeEventListener?.('webglcontextrestored',resetFrames);geometry.dispose();for(const {mesh} of orbs)mesh.material.dispose();ctx.clearRect(0,0,canvas.width,canvas.height);},
  };
}
