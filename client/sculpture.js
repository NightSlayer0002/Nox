import * as THREE from 'three';

// The scene renders on demand. React Spring owns rotation; this module owns pixels.
export function createSculpture(host){
  const holder=host.querySelector('.sculpture-canvas');
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
  renderer.setClearColor(0x000000,0);renderer.transmissionResolutionScale=.5;
  renderer.domElement.setAttribute('aria-hidden','true');holder.appendChild(renderer.domElement);
  const world=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,30),group=new THREE.Group();
  camera.position.set(0,.18,6.5);world.add(group);
  world.add(new THREE.HemisphereLight(0xffffff,0x6c7c72,3));
  const key=new THREE.DirectionalLight(0xffffff,3.7);key.position.set(-3,4,5);world.add(key);
  const rim=new THREE.DirectionalLight(0x70cdb5,2.5);rim.position.set(3,1,-2);world.add(rim);
  const resources=[];
  for(let i=0;i<4;i++){
    const geometry=new THREE.BoxGeometry(2.05,2.5,.055);
    const material=new THREE.MeshPhysicalMaterial({color:i%2?0xb7dcd0:0xe5ede4,metalness:.03,roughness:.2,transmission:.45,transparent:true,opacity:.48,thickness:.12,ior:1.3,side:THREE.DoubleSide,depthWrite:false});
    const slab=new THREE.Mesh(geometry,material);slab.position.set((i-1.5)*.23,(i-1.5)*.13,(i-1.5)*.34);slab.rotation.z=-.055;group.add(slab);
    const edgeGeometry=new THREE.EdgesGeometry(geometry),edgeMaterial=new THREE.LineBasicMaterial({color:0x3a8c79,transparent:true,opacity:.38});
    const edges=new THREE.LineSegments(edgeGeometry,edgeMaterial);edges.position.copy(slab.position);edges.rotation.copy(slab.rotation);group.add(edges);
    resources.push(geometry,material,edgeGeometry,edgeMaterial);
  }
  group.rotation.set(-.08,-.35,.08);
  const baseGeometry=new THREE.CircleGeometry(1.5,64),baseMaterial=new THREE.MeshBasicMaterial({color:0x194d3c,transparent:true,opacity:.035,depthWrite:false});
  const base=new THREE.Mesh(baseGeometry,baseMaterial);base.rotation.x=-Math.PI/2;base.position.set(.1,-1.5,0);world.add(base);resources.push(baseGeometry,baseMaterial);
  let visible=true,disposed=false,raf=0,lost=false;
  const paint=()=>{raf=0;if(!disposed&&visible&&!document.hidden&&!lost)renderer.render(world,camera);};
  const invalidate=()=>{if(!raf&&!disposed&&visible&&!document.hidden&&!lost)raf=requestAnimationFrame(paint);};
  const resize=()=>{const box=host.getBoundingClientRect();if(box.width<1||box.height<1)return;camera.aspect=box.width/box.height;camera.updateProjectionMatrix();renderer.setSize(box.width,box.height,false);invalidate();};
  const observer=new ResizeObserver(resize);observer.observe(host);
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else invalidate();};
  const contextLost=e=>{e.preventDefault();lost=true;host.dataset.scene='fallback';cancelAnimationFrame(raf);raf=0;};
  const contextRestored=()=>{lost=false;host.dataset.scene='ready';invalidate();};
  document.addEventListener('visibilitychange',visibility);renderer.domElement.addEventListener('webglcontextlost',contextLost);renderer.domElement.addEventListener('webglcontextrestored',contextRestored);resize();
  return {
    setRotation(x,y){group.rotation.x=-.08+x;group.rotation.y=-.35+y;invalidate();},
    setVisible(next){visible=next;if(!next){cancelAnimationFrame(raf);raf=0;}else invalidate();},
    dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',visibility);renderer.domElement.removeEventListener('webglcontextlost',contextLost);renderer.domElement.removeEventListener('webglcontextrestored',contextRestored);resources.forEach(r=>r.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();},
  };
}
