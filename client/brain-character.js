import * as THREE from 'three';
import {decodeBrain} from '../public/js/brain-data.js';
import {createBrainLifecycle} from '../public/js/brain-lifecycle.js';
import {createNeuralGraph} from '../public/js/brain-network.js';
import {nodeVertexShader,nodeFragmentShader,linkVertexShader,linkFragmentShader,waveVertexShader,waveFragmentShader,ghostVertexShader,ghostFragmentShader} from './brain-network-shaders.js';

// BodyParts3D/DBCLS supplies the anatomical envelope. The connected-particle
// presentation follows Three.js's MIT-licensed buffergeometry drawrange example;
// NOX keeps this graph static and animates its light on the GPU.
export async function createBrainCharacter({signal}={}){
  const response=await fetch('/vendor/bodyparts3d/brain.bin',{signal});
  if(!response.ok)throw Error('Brain asset unavailable');
  const source=decodeBrain(await response.arrayBuffer());signal?.throwIfAborted();
  let renderer,geometry,nodeGeometry,linkGeometry,waveGeometry,ghostMaterial,nodeMaterial,linkMaterial,waveMaterial;
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
    const along=new Float32Array(graph.edgeCount*2);
    for(let i=1;i<along.length;i+=2)along[i]=1;
    linkGeometry.setAttribute('aAlong',new THREE.BufferAttribute(along,1).setUsage(THREE.StaticDrawUsage));
    linkGeometry.setDrawRange(0,graph.edgeCount*2);linkGeometry.computeBoundingSphere();
    // One fixed annulus, instanced twice per wave, expands in the vertex shader.
    // No positions or instance attributes need CPU updates after initialization.
    const segments=96,ringPositions=new Float32Array((segments+1)*6),ringIndices=new Uint16Array(segments*6);
    for(let i=0;i<=segments;i++){
      const angle=i/segments*Math.PI*2,x=Math.cos(angle),y=Math.sin(angle),offset=i*6;
      ringPositions.set([x,y,-1,x,y,1],offset);
      if(i<segments)ringIndices.set([i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2],i*6);
    }
    const waveSlots=new Float32Array(16),planes=new Float32Array(16);
    for(let i=0;i<16;i++){waveSlots[i]=Math.floor(i/2);planes[i]=i%2;}
    waveGeometry=new THREE.InstancedBufferGeometry();geometries.push(waveGeometry);
    waveGeometry.setAttribute('position',new THREE.BufferAttribute(ringPositions,3).setUsage(THREE.StaticDrawUsage));
    waveGeometry.setAttribute('aWaveSlot',new THREE.InstancedBufferAttribute(waveSlots,1).setUsage(THREE.StaticDrawUsage));
    waveGeometry.setAttribute('aPlane',new THREE.InstancedBufferAttribute(planes,1).setUsage(THREE.StaticDrawUsage));
    waveGeometry.setIndex(new THREE.BufferAttribute(ringIndices,1));waveGeometry.instanceCount=16;
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1.15,1.15,1.15,-1.15,.1,20);camera.position.set(0,0,5);
    const group=new THREE.Group();scene.add(group);
    const clock={value:0},energy={value:.12},tint={value:new THREE.Color('#8ee6e0')};
    const drive={value:.12},pressure={value:0},waveTime={value:0};
    const waves=Array.from({length:8},()=>new THREE.Vector4(0,0,0,0)),waveStarts=new Float32Array(8);
    waveStarts.fill(-10);
    const uniforms={brainClock:clock,brainEnergy:energy,brainDrive:drive,brainPressure:pressure,brainWaveTime:waveTime,brainWaves:{value:waves},brainWaveStarts:{value:waveStarts},brainTint:tint};
    const luminous={uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending};
    // A nearly invisible Fresnel trace preserves the source's silhouette while
    // nodes and links remain the visible character, including through the volume.
    ghostMaterial=new THREE.ShaderMaterial({...luminous,vertexShader:ghostVertexShader,fragmentShader:ghostFragmentShader,side:THREE.FrontSide});
    materials.push(ghostMaterial);
    nodeMaterial=new THREE.ShaderMaterial({...luminous,vertexShader:nodeVertexShader,fragmentShader:nodeFragmentShader});
    materials.push(nodeMaterial);
    linkMaterial=new THREE.ShaderMaterial({...luminous,vertexShader:linkVertexShader,fragmentShader:linkFragmentShader});
    materials.push(linkMaterial);
    waveMaterial=new THREE.ShaderMaterial({...luminous,vertexShader:waveVertexShader,fragmentShader:waveFragmentShader,side:THREE.DoubleSide,forceSinglePass:true});
    materials.push(waveMaterial);
    group.add(new THREE.Mesh(geometry,ghostMaterial));
    group.add(new THREE.LineSegments(linkGeometry,linkMaterial));
    group.add(new THREE.Points(nodeGeometry,nodeMaterial));
    const waveRings=new THREE.Mesh(waveGeometry,waveMaterial);
    // The shader grows far beyond the unit annulus's CPU bounds.
    waveRings.frustumCulled=false;group.add(waveRings);
    canvas.dataset.geometry='bodyparts3d-neural-brain';
    canvas.dataset.nodes=String(graph.nodeCount);canvas.dataset.edges=String(graph.edgeCount);
    canvas.dataset.waves='0';canvas.dataset.drive='0.12';canvas.dataset.waveSerial='0';
    let lastWaveCount=0,lastDrive=12,lastWaveSerial=0;
    return createBrainLifecycle({canvas,disposeResources,draw(state,focus){
      if(renderer.getContext().isContextLost())return false;
      // Stage owns time, motion preference and cadence. GPU attributes never
      // change after upload; each frame updates only these shared uniforms.
      clock.value=state.clock;energy.value=state.energy;
      drive.value=Math.max(0,Math.min(1,state.drive??state.energy));
      pressure.value=state.motion?Math.max(0,Math.min(1,focus.pressure??0)):0;
      waveTime.value=state.waveTime??state.clock;
      const waveCount=Math.min(8,state.waves?.length??0);
      for(let i=0;i<8;i++){
        const wave=i<waveCount?state.waves[i]:null;
        if(wave){waves[i].set(wave.origin[0],wave.origin[1],wave.origin[2],wave.strength);waveStarts[i]=wave.startedAt;}
        else{waves[i].w=0;waveStarts[i]=-10;}
      }
      // QA attributes change only when their bounded, quantized values change.
      const drivePercent=Math.round(drive.value*100),waveSerial=state.waveSerial??0;
      if(waveCount!==lastWaveCount){canvas.dataset.waves=String(waveCount);lastWaveCount=waveCount;}
      if(drivePercent!==lastDrive){canvas.dataset.drive=String(drivePercent/100);lastDrive=drivePercent;}
      if(waveSerial!==lastWaveSerial){canvas.dataset.waveSerial=String(waveSerial);lastWaveSerial=waveSerial;}
      const uncanny=state.color[0]===1&&state.color[1]<.2;
      tint.value.setHex(uncanny?0xff977f:state.status==='listening'?0xcaf1ff:state.color[1]>.6?0xead4a2:0x8ee6e0);
      group.rotation.set(.16+(state.motion?focus.y*.12:0),-.45+(state.motion?focus.x*.25+Math.sin(state.clock*.36)*.1:0),-.035);
      group.position.y=pressure.value*.035;group.scale.setScalar(1+pressure.value*.018);
      renderer.render(scene,camera);return true;
    }});
  }catch(error){disposeResources();throw error;}
}
