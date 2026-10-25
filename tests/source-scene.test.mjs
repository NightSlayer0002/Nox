import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import * as sourceEffects from '../public/js/source-effects.js';
import * as terrainMotion from '../public/js/source-terrain.js';

const bundle=await build({entryPoints:[fileURLToPath(new URL('../client/source-scene.jsx',import.meta.url))],bundle:true,write:false,metafile:true,platform:'node',format:'cjs',jsx:'transform',external:['react','@shadergradient/react','@react-three/fiber','@react-spring/web','/js/*']});

function world(){
  const effects=[],frames=[],observers=[],loops=[],published=[];let now=0,stateIndex=0;
  const document=Object.assign(new EventTarget(),{hidden:false,body:{dataset:{}},scrollingElement:{scrollTop:0,scrollHeight:1600,clientHeight:800}}),window=new EventTarget();
  const gl={domElement:{dataset:{}},render(){gl.renders=(gl.renders||0)+1;}},mesh={material:{userData:{uTime:{value:0},uNoiseStrength:{value:3.6},uNoiseDensity:{value:1.12}},onBeforeCompile(){}},rotation:{set(...value){this.value=value;}},position:{set(...value){this.value=value;}}};
  const react={Component:class{},memo:value=>value,createElement:(type,props,...children)=>({type,props:{...props,children}}),useRef:current=>({current}),useEffect:effect=>effects.push(effect),useState(initial){return [stateIndex++===0?true:typeof initial==='function'?initial():initial,()=>{}];}};
  const modules={react,'@shadergradient/react':{ShaderGradient:'water-material',ShaderGradientCanvas:'water-canvas'},'@react-three/fiber':{useFrame:frame=>frames.push(frame),useThree:()=>({gl,setFrameloop:value=>loops.push(value),invalidate(){}})},'/js/source-effects.js':sourceEffects,'/js/source-terrain.js':terrainMotion,'/js/preferences.js':{readMotionPreference:()=>true}};
  const module={exports:{}};
  vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,require:name=>{if(!(name in modules))throw Error(`Unexpected dependency: ${name}`);return modules[name];},document,window,innerWidth:1000,innerHeight:800,devicePixelRatio:2,performance:{now:()=>now},IntersectionObserver:class{constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}});
  const tree=module.exports.default({onCanvas:canvas=>published.push(canvas),pose:{waterTurn:.25,waterX:.1}});
  const nodes=node=>!node||typeof node!=='object'?[]:[node,...node.props.children.flat(Infinity).flatMap(nodes)];
  const all=nodes(tree),canvas=all.find(node=>node.type==='water-canvas'),material=all.find(node=>node.type==='water-material'),budget=all.find(node=>typeof node.type==='function'&&node.type.name==='Budget');
  effects.length=0;budget.type(budget.props);const cleanups=effects.map(effect=>effect());
  return {canvas,material,gl,mesh,document,window,observers,loops,published,frame(time){now=time;frames[0]({gl,scene:{getObjectByName:name=>name==='shadergradient-mesh'?mesh:null},camera:{}});},event(type,values={}){document.dispatchEvent(Object.assign(new Event(type),values));},dispose(){cleanups.forEach(cleanup=>cleanup?.());}};
}

test('the water world has no dependency on a separate pointer-tilt animation system',()=>{
  const imports=Object.values(bundle.metafile.outputs).flatMap(output=>output.imports.map(item=>item.path));
  assert.ok(!imports.includes('@react-spring/web'),'Default water must not load the unused sculpture spring');
});

test('the live world retains its authored water surface and responds to pointer and scroll input',()=>{
  const room=world();
  assert.equal(room.canvas.props.pixelDensity,1.5);
  assert.equal(room.material.props.type,'waterPlane');assert.equal(room.material.props.animate,'off');
  assert.deepEqual([room.material.props.color1,room.material.props.color2,room.material.props.color3],['#0c1b25','#284a50','#49766f']);
  assert.equal(room.material.props.uStrength,3.6);assert.equal(room.material.props.uDensity,1.12);assert.equal(room.material.props.brightness,.62);assert.equal(room.material.props.reflection,.04);
  room.frame(0);const first=room.mesh.material.userData.uTime.value;
  room.event('pointermove',{pointerType:'mouse',isPrimary:true,clientX:1000,clientY:0});
  room.document.scrollingElement.scrollTop=800;room.event('scroll');
  room.document.body.dataset.activity='thinking';room.document.body.dataset.voiceState='speaking';
  for(let index=1;index<=60;index++)room.frame(index*1000/60);
  assert.equal(room.gl.renders,31,'Water keeps its existing 30fps material cadence');
  assert.ok(room.mesh.material.userData.uTime.value>first+.9);
  assert.ok(room.mesh.material.userData.uNoiseDensity.value>1.2);
  assert.ok(room.mesh.position.value[0]>.3);assert.ok(room.mesh.rotation.value[1]>.02);
  assert.equal(room.gl.domElement.dataset.geometry,'water-plane');assert.equal(room.mesh.material.customProgramCacheKey(),'nox-water-relief-v2');
  room.dispose();
});

test('the water render lifecycle stops offscreen and releases its published canvas',()=>{
  const room=world();assert.equal(room.published[0],room.gl.domElement);assert.equal(room.loops.at(-1),'always');
  room.observers[0].callback([{isIntersecting:false}]);assert.equal(room.loops.at(-1),'never');
  room.observers[0].callback([{isIntersecting:true}]);assert.equal(room.loops.at(-1),'always');
  room.document.hidden=true;room.event('visibilitychange');assert.equal(room.loops.at(-1),'never');
  room.dispose();assert.equal(room.observers[0].disconnected,true);assert.equal(room.published.at(-1),null);
  const previous=room.loops.length;room.document.hidden=false;room.event('visibilitychange');assert.equal(room.loops.length,previous);
});
