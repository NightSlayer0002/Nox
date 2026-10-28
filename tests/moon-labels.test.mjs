import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import {moonPhase} from '../shared/everyday-activities.js';

// Question per angle: does this model reserve exact phase names for the
// corresponding geometry? This is not a live ephemeris or astronomy validation.
const positions=[[0,'New Moon'],[1,'Waxing crescent'],[20,'Waxing crescent'],[68,'Waxing crescent'],[89,'Waxing crescent'],[90,'First quarter'],[91,'Waxing gibbous'],[112,'Waxing gibbous'],[160,'Waxing gibbous'],[180,'Full Moon'],[225,'Waning gibbous'],[270,'Third quarter'],[271,'Waning crescent'],[359,'Waning crescent'],[360,'New Moon']];
for(const [angle,name] of positions)test(`Moon model labels ${angle} degrees as ${name} without rounding to an exact phase`,()=>{
  const phase=moonPhase(angle);assert.equal(phase.name,name);
  assert.equal(phase.fraction,(1-Math.cos(phase.degrees*Math.PI/180))/2);
});

const nativeRequire=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..');
const bundled=await build({entryPoints:[path.join(root,'client/everyday-activities.jsx')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'moon-component',setup(builder){
  builder.onLoad({filter:/client[\\/]everyday-activities\.jsx$/},async args=>({contents:(await readFile(args.path,'utf8'))+'\nexport {MoonDiagram};',loader:'jsx'}));
  builder.onResolve({filter:/^(react|\/js\/everyday-bridge\.js)$/},args=>({path:args.path,external:true}));
}}]});
const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useId:()=> 'moon-fixture'};
const module={exports:{}};vm.runInNewContext(bundled.outputFiles[0].text,{module,exports:module.exports,require:id=>id==='react'?react:id==='/js/everyday-bridge.js'?{}:nativeRequire(id)});
const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'?[node,...nodes(node.props?.children)]:[];
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):String(node??'');
for(const [angle,name] of positions)test(`Moon controls and accessible labels agree at ${angle} degrees`,()=>{
  // Resolves actual component properties, not browser SVG appearance or AT speech.
  const tree=nodes(module.exports.MoonDiagram({angle,onChange(){}}));
  assert.equal(text(tree.find(node=>node.type==='title')),`Moon phases: ${name}`);
  assert.ok(tree.find(node=>node.type==='input').props['aria-valuetext'].startsWith(`${name}, `));
  const expected=new Map([[0,'New'],[90,'First quarter'],[180,'Full'],[270,'Third quarter']]);
  const pressed=tree.filter(node=>node.type==='button'&&node.props['aria-pressed']).map(text);
  assert.deepEqual(pressed,expected.has(moonPhase(angle).degrees)?[expected.get(moonPhase(angle).degrees)]:[]);
});
