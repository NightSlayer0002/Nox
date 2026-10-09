// Adapted from React Flow's official custom-node/animated-edge examples.
// Nodes represent the actual three signals and selected pair of endings.
import React,{useMemo} from 'react';
import {ReactFlow,Handle,Position,Background} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

function ReceptionNode({data}){
  return <div className={`reception-node ${data.kind} ${data.active?'is-active':''}`}>
    {data.kind!=='origin'&&<Handle type="target" position={Position.Left}/>}
    {data.kind==='origin'?<><img src="/icon.svg" alt=""/><span>THE SEED</span></>:<><small>{data.code}</small><b>{data.label}</b></>}
    {data.kind!=='ending'&&<Handle type="source" position={Position.Right}/>}
  </div>;
}
const nodeTypes={reception:ReceptionNode};
export default function AfterimageLattice({packet,signalIndex,endingIndex,onSignal,onEnding,playing,disabled}){
  const nodes=useMemo(()=>[
    {id:'seed',type:'reception',position:{x:0,y:109},data:{kind:'origin',active:true}},
    ...packet.signals.map((signal,index)=>({id:`signal-${index}`,type:'reception',position:{x:130,y:index*108},data:{kind:'signal',code:`SIGNAL 0${index+1}`,label:signal.label,active:index===signalIndex}})),
    ...packet.signals[signalIndex].endings.map((ending,index)=>({id:`ending-${index}`,type:'reception',position:{x:330,y:54+index*108},data:{kind:'ending',code:`ENDING ${index===0?'A':'B'}`,label:ending.label,active:index===endingIndex}})),
  ],[packet,signalIndex,endingIndex]);
  const edges=useMemo(()=>[
    ...packet.signals.map((_,index)=>({id:`seed-${index}`,source:'seed',target:`signal-${index}`,animated:playing&&index===signalIndex,type:'smoothstep',style:{stroke:index===signalIndex?'#89cdbb':'#304c4e',strokeWidth:index===signalIndex?2:1}})),
    ...[0,1].map(index=>({id:`end-${index}`,source:`signal-${signalIndex}`,target:`ending-${index}`,animated:playing&&index===endingIndex,type:'smoothstep',style:{stroke:index===endingIndex?'#89cdbb':'#304c4e',strokeWidth:index===endingIndex?2:1}})),
  ],[packet,signalIndex,endingIndex,playing]);
  return <div className="afterimage-lattice" aria-hidden="true">
    <ReactFlow key={packet.title} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{padding:.1}} minZoom={.4} maxZoom={1.1} colorMode="dark" nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false} elementsSelectable={false} panOnDrag={false} zoomOnScroll={false} zoomOnDoubleClick={false} zoomOnPinch={false} preventScrolling={false} onNodeClick={(_event,node)=>{if(disabled||playing)return;if(node.id.startsWith('signal-'))onSignal(Number(node.id.slice(7)));if(node.id.startsWith('ending-'))onEnding(Number(node.id.slice(7)));}}>
      <Background color="#37514f" gap={26} size={.55}/>
    </ReactFlow>
  </div>;
}
