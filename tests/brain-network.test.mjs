import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeBrain} from '../public/js/brain-data.js';

// Budgeting and graph validity matter: an unbounded network can lock a phone.
const modulePath='../public/js/brain-network.js';
test('the anatomical network stays within its node and connection budgets',async()=>{
  const {createNeuralGraph}=await import(modulePath);
  const data=await readFile(new URL('../public/vendor/bodyparts3d/brain.bin',import.meta.url));
  const source=decodeBrain(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
  const normalized=new Float32Array(source.positions);
  for(let i=0;i<normalized.length;i++)normalized[i]/=200;
  const graph=createNeuralGraph(normalized,{maxNodes:2000,maxEdges:5000});
  assert.equal(graph.nodeCount,2000);
  assert.ok(graph.edgeCount>1000&&graph.edgeCount<=5000);
  assert.equal(graph.positions.length,graph.nodeCount*3);
  assert.equal(graph.links.length,graph.edgeCount*6);
  assert.equal(graph.nodePhase.length,graph.nodeCount);
  assert.equal(graph.linkPhase.length,graph.edgeCount*2);
  assert.ok(graph.positions.every(Number.isFinite)&&graph.links.every(Number.isFinite));
});
test('network edges have distinct endpoints and graph construction is deterministic',async()=>{
  const {createNeuralGraph}=await import(modulePath);
  const positions=Float32Array.from({length:900},(_,i)=>Math.sin(i*.37)*.65);
  const first=createNeuralGraph(positions,{maxNodes:100,maxEdges:200});
  assert.deepEqual(first,createNeuralGraph(positions,{maxNodes:100,maxEdges:200}));
  for(let i=0;i<first.links.length;i+=6)assert.ok(Math.hypot(first.links[i]-first.links[i+3],first.links[i+1]-first.links[i+4],first.links[i+2]-first.links[i+5])>0);
});
test('malformed coordinates and extreme budgets cannot create runaway buffers',async()=>{
  const {createNeuralGraph}=await import(modulePath);
  assert.throws(()=>createNeuralGraph(new Float32Array([0,NaN,1])),/coordinates/);
  assert.throws(()=>createNeuralGraph(new Float32Array(5)),/coordinates/);
  assert.throws(()=>createNeuralGraph(new Float32Array(3),{maxNodes:Infinity}),/budget/);
  assert.throws(()=>createNeuralGraph(new Float32Array(3),{maxEdges:1e9}),/budget/);
  const duplicate=createNeuralGraph(new Float32Array(900));
  assert.equal(duplicate.nodeCount,1);assert.equal(duplicate.edgeCount,0);
});
