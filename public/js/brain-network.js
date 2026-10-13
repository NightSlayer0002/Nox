// Anatomical anchors from BodyParts3D; connections are a deterministic visual
// network, not measured neural wiring. Static buffers use the Three.js drawrange
// example's Points/LineSegments pattern, with bounded local-neighbour lookup.
const hash=value=>{const x=Math.sin(value*127.1+31.7)*43758.5453;return x-Math.floor(x);};
export function createNeuralGraph(source,{maxNodes=4200,maxEdges=11000}={}){
  if(!(source instanceof Float32Array)||!source.length||source.length%3||source.length>540000||!source.every(Number.isFinite))throw Error('Invalid network coordinates');
  if(!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>6000||!Number.isInteger(maxEdges)||maxEdges<0||maxEdges>18000)throw Error('Invalid network budget');
  const vertices=source.length/3,limit=Math.min(vertices,maxNodes),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<source.length;i++) {const axis=i%3;min[axis]=Math.min(min[axis],source[i]);max[axis]=Math.max(max[axis],source[i]);}
  const center=min.map((v,i)=>(v+max[i])/2),extent=Math.max(...max.map((v,i)=>v-min[i])),cell=Math.max(extent/12,.001);
  const nodes=[],seen=new Set(),phases=[];
  for(let i=0;i<Math.min(vertices*2,maxNodes*8)&&phases.length<limit;i++){
    const index=Math.floor((i*.618033988749895%1)*vertices)*3;
    // A fifth of anchors is projected inward, giving the illustration depth.
    const radial=i%5===0?.58+hash(i)*.32:1;
    const point=center.map((c,a)=>c+(source[index+a]-c)*radial),key=point.map(v=>Math.round(v*100000)).join(',');
    if(seen.has(key))continue;seen.add(key);nodes.push(...point);phases.push(hash(i+2));
  }
  const nodeCount=phases.length,buckets=new Map(),key=(x,y,z)=>`${x},${y},${z}`;
  for(let i=0;i<nodeCount;i++){
    const k=key(...nodes.slice(i*3,i*3+3).map(v=>Math.floor(v/cell))),bucket=buckets.get(k)||[];
    bucket.push(i);buckets.set(k,bucket);
  }
  const neighbours=[];
  for(let i=0;i<nodeCount;i++){
    const start=i*3,[cx,cy,cz]=nodes.slice(start,start+3).map(v=>Math.floor(v/cell)),closest=[];
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
      const bucket=buckets.get(key(cx+dx,cy+dy,cz+dz));if(!bucket)continue;
      // Dense/pathological source clusters cannot become all-pairs searches.
      const stride=Math.max(1,Math.ceil(bucket.length/96));
      for(let j=0;j<bucket.length;j+=stride){const candidate=bucket[j];if(candidate===i)continue;
        const k=candidate*3,distance=(nodes[start]-nodes[k])**2+(nodes[start+1]-nodes[k+1])**2+(nodes[start+2]-nodes[k+2])**2;
        if(distance>0&&distance<=cell*cell*3)closest.push({candidate,distance});
      }
    }
    closest.sort((a,b)=>a.distance-b.distance||a.candidate-b.candidate);neighbours.push(closest.slice(0,5));
  }
  const links=[],linkPhase=[],pairs=new Set();
  // One neighbour per node first: edge caps do not starve the last brain parts.
  for(let depth=0;depth<5&&pairs.size<maxEdges;depth++)for(let i=0;i<nodeCount&&pairs.size<maxEdges;i++){
    const candidate=neighbours[i][depth]?.candidate;if(candidate===undefined)continue;
    const pair=i<candidate?`${i}:${candidate}`:`${candidate}:${i}`;if(pairs.has(pair))continue;pairs.add(pair);
    links.push(...nodes.slice(i*3,i*3+3),...nodes.slice(candidate*3,candidate*3+3));const phase=hash(i*19+candidate*7);linkPhase.push(phase,phase);
  }
  return {positions:new Float32Array(nodes),links:new Float32Array(links),nodePhase:new Float32Array(phases),linkPhase:new Float32Array(linkPhase),nodeCount,edgeCount:pairs.size};
}
