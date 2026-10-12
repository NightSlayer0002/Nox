import * as THREE from 'three';
import {decodeBrain} from '../public/js/brain-data.js';
import {createBrainLifecycle} from '../public/js/brain-lifecycle.js';

// Anatomy comes from BodyParts3D/DBCLS. Light, camera and material adapt its
// presentation; the mesh is never generated or deformed into a fake brain.
export async function createBrainCharacter({signal}={}){
  const response=await fetch('/vendor/bodyparts3d/brain.bin',{signal});
  if(!response.ok)throw Error('Brain asset unavailable');
  const source=decodeBrain(await response.arrayBuffer());signal?.throwIfAborted();
  let renderer,geometry,material,pointsMaterial;
  const disposeResources=()=>{geometry?.dispose();material?.dispose();pointsMaterial?.dispose();renderer?.dispose();renderer?.forceContextLoss();};
  try{
    const canvas=document.createElement('canvas');
    renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
    renderer.setPixelRatio(1);renderer.setSize(512,512,false);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
    geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(source.positions,3));geometry.setIndex(new THREE.BufferAttribute(source.indices,1));
    // The original dataset is Z-up. Reorient to Three Y-up without changing
    // anatomy, then fit its longest dimension inside a fixed capture frame.
    geometry.rotateX(-Math.PI/2);geometry.center();geometry.computeBoundingBox();
    const bounds=geometry.boundingBox.getSize(new THREE.Vector3()),scale=1.48/Math.max(bounds.x,bounds.y,bounds.z);geometry.scale(scale,scale,scale);geometry.computeVertexNormals();
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,20);camera.position.set(0,0,5);
    const group=new THREE.Group();scene.add(group);
    const clock={value:0},energy={value:.12},tint={value:new THREE.Color('#8ee6e0')};
    material=new THREE.MeshStandardMaterial({color:'#548d91',metalness:.38,roughness:.46,emissive:'#6fcec8',emissiveIntensity:.18});
    // Thin emissive scan bands and a Fresnel rim read as a hologram while
    // physical lighting keeps the source mesh's actual cortical folds clear.
    material.onBeforeCompile=shader=>{
      shader.uniforms.brainClock=clock;shader.uniforms.brainEnergy=energy;shader.uniforms.brainTint=tint;
      shader.vertexShader='varying vec3 brainPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nbrainPosition = position;');
      shader.fragmentShader='varying vec3 brainPosition;\nuniform float brainClock;\nuniform float brainEnergy;\nuniform vec3 brainTint;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nfloat band = pow(0.5 + 0.5 * sin(brainPosition.y * 105.0 - brainClock * 2.0), 16.0);\nfloat rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.8);\ntotalEmissiveRadiance += brainTint * (band * 0.14 + rim * (0.25 + brainEnergy * 0.65));');
    };material.customProgramCacheKey=()=> 'nox-bodyparts-brain-hologram-v1';
    group.add(new THREE.Mesh(geometry,material));
    pointsMaterial=new THREE.PointsMaterial({color:'#c1fff6',size:.006,sizeAttenuation:true,transparent:true,opacity:.18,depthWrite:false});group.add(new THREE.Points(geometry,pointsMaterial));
    scene.add(new THREE.HemisphereLight('#e8fffa','#183137',2.1));
    for(const [color,intensity,position] of [['#bdfff3',3.1,[-2,2,4]],['#d3c9ff',2.1,[3,1,0]],['#42c6c2',2.2,[-2,-1,-2]]]){const light=new THREE.DirectionalLight(color,intensity);light.position.set(...position);scene.add(light);}
    canvas.dataset.geometry='bodyparts3d-brain';
    return createBrainLifecycle({canvas,disposeResources,draw(state,focus){
      if(renderer.getContext().isContextLost())return false;
      clock.value=state.clock;energy.value=state.energy;
      const uncanny=state.color[0]===1&&state.color[1]<.2;
      tint.value.set(uncanny?'#ff977f':state.status==='listening'?'#caf1ff':state.color[1]>.6?'#ead4a2':'#8ee6e0');
      material.emissive.copy(tint.value);material.emissiveIntensity=.12+state.energy*.24;pointsMaterial.color.copy(tint.value);pointsMaterial.opacity=.1+state.energy*.17;
      group.rotation.set(.16+(state.motion?focus.y*.12:0),-.45+(state.motion?focus.x*.25+Math.sin(state.clock*.36)*.1:0),-.035);
      renderer.render(scene,camera);return true;
    }});
  }catch(error){disposeResources();throw error;}
}
