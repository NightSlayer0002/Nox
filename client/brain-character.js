import * as THREE from 'three';
import {decodeBrain} from '../public/js/brain-data.js';
import {createBrainLifecycle} from '../public/js/brain-lifecycle.js';
import {createNeuralGraph} from '../public/js/brain-network.js';
import {nodeVertexShader,nodeFragmentShader,linkVertexShader,linkFragmentShader,ghostVertexShader,ghostFragmentShader} from './brain-network-shaders.js';

// BodyParts3D/DBCLS supplies the anatomical envelope. The connected-particle
// presentation follows Three.js's MIT-licensed buffergeometry drawrange example;
// NOX keeps this graph static and animates its light on the GPU.
export async function createBrainCharacter({signal}={}){
  const response=await fetch('/vendor/bodyparts3d/brain.bin',{signal});
  if(!response.ok)throw Error('Brain asset unavailable');
  const source=decodeBrain(await response.arrayBuffer());signal?.throwIfAborted();
  let renderer,geometry,nodeGeometry,linkGeometry,ghostMaterial,nodeMaterial,linkMaterial;
  const geometries=[],materials=[];
  const disposeResources=()=>{
    for(const resource of geometries)resource.dispose();
    for(const resource of materials)resource.dispose();
    renderer?.dispose();renderer?.forceContextLoss();
  };
  try{
    const canvas=document.createElement('canvas');
    renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
    renderer.setPixelRatio(1);renderer.setSize(512,512,false);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
    geometry=new THREE.BufferGeometry();geometries.push(geometry);geometry.setAttribute('position',new THREE.BufferAttribute(source.positions,3));geometry.setIndex(new THREE.BufferAttribute(source.indices,1));
    // The original dataset is Z-up. Reorient to Three Y-up without changing
    // anatomy, then fit its longest dimension inside a fixed capture frame.
    geometry.rotateX(-Math.PI/2);geometry.center();geometry.computeBoundingBox();
    const bounds=geometry.boundingBox.getSize(new THREE.Vector3()),scale=1.48/Math.max(bounds.x,bounds.y,bounds.z);geometry.scale(scale,scale,scale);geometry.computeVertexNormals();
    const compact=globalThis.innerWidth<700;
    const graph=createNeuralGraph(geometry.getAttribute('position').array,{maxNodes:compact?2000:4200,maxEdges:compact?5000:11000});
    nodeGeometry=new THREE.BufferGeometry();geometries.push(nodeGeometry);
    nodeGeometry.setAttribute('position',new THREE.BufferAttribute(graph.positions,3).setUsage(THREE.StaticDrawUsage));
    nodeGeometry.setAttribute('phase',new THREE.BufferAttribute(graph.nodePhase,1).setUsage(THREE.StaticDrawUsage));
    nodeGeometry.setDrawRange(0,graph.nodeCount);nodeGeometry.computeBoundingSphere();
    linkGeometry=new THREE.BufferGeometry();geometries.push(linkGeometry);
    linkGeometry.setAttribute('position',new THREE.BufferAttribute(graph.links,3).setUsage(THREE.StaticDrawUsage));
    linkGeometry.setAttribute('phase',new THREE.BufferAttribute(graph.linkPhase,1).setUsage(THREE.StaticDrawUsage));
    linkGeometry.setDrawRange(0,graph.edgeCount*2);linkGeometry.computeBoundingSphere();
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,20);camera.position.set(0,0,5);
    const group=new THREE.Group();scene.add(group);
    const clock={value:0},energy={value:.12},tint={value:new THREE.Color('#8ee6e0')};
    const uniforms={brainClock:clock,brainEnergy:energy,brainTint:tint};
    const luminous={uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending};
    // A nearly invisible Fresnel trace preserves the source's silhouette while
    // nodes and links remain the visible character, including through the volume.
    ghostMaterial=new THREE.ShaderMaterial({...luminous,vertexShader:ghostVertexShader,fragmentShader:ghostFragmentShader,side:THREE.FrontSide});
    materials.push(ghostMaterial);
    nodeMaterial=new THREE.ShaderMaterial({...luminous,vertexShader:nodeVertexShader,fragmentShader:nodeFragmentShader});
    materials.push(nodeMaterial);
    linkMaterial=new THREE.ShaderMaterial({...luminous,vertexShader:linkVertexShader,fragmentShader:linkFragmentShader});
    materials.push(linkMaterial);
    group.add(new THREE.Mesh(geometry,ghostMaterial));
    group.add(new THREE.LineSegments(linkGeometry,linkMaterial));
    group.add(new THREE.Points(nodeGeometry,nodeMaterial));
    canvas.dataset.geometry='bodyparts3d-neural-brain';
    canvas.dataset.nodes=String(graph.nodeCount);canvas.dataset.edges=String(graph.edgeCount);
    return createBrainLifecycle({canvas,disposeResources,draw(state,focus){
      if(renderer.getContext().isContextLost())return false;
      // Stage owns time, motion preference and cadence. GPU attributes never
      // change after upload; each frame updates only these shared uniforms.
      clock.value=state.clock;energy.value=state.energy;
      const uncanny=state.color[0]===1&&state.color[1]<.2;
      tint.value.set(uncanny?'#ff977f':state.status==='listening'?'#caf1ff':state.color[1]>.6?'#ead4a2':'#8ee6e0');
      group.rotation.set(.16+(state.motion?focus.y*.12:0),-.45+(state.motion?focus.x*.25+Math.sin(state.clock*.36)*.1:0),-.035);
      renderer.render(scene,camera);return true;
    }});
  }catch(error){disposeResources();throw error;}
}
