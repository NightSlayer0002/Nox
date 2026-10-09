import {Shape,ExtrudeGeometry} from 'three';
import {blobPath} from '../public/js/face-art.js';

// The existing NOX outline, given real rounded depth using the Three geometry
// API already used by the R3F brand adaptation. No separate stock body/model.
export function createLiquidGeometry(){
  const shape=new Shape();
  blobPath({
    beginPath(){},moveTo:(x,y)=>shape.moveTo(x,-y),
    lineTo:(x,y)=>shape.lineTo(x,-y),closePath:()=>shape.closePath(),
    bezierCurveTo:(x1,y1,x2,y2,x,y)=>shape.bezierCurveTo(x1,-y1,x2,-y2,x,-y),
    quadraticCurveTo:(x1,y1,x,y)=>shape.quadraticCurveTo(x1,-y1,x,-y)
  });
  const geometry=new ExtrudeGeometry(shape,{depth:28,bevelEnabled:true,bevelThickness:90,bevelSize:55,bevelSegments:12,curveSegments:24,steps:1});
  geometry.computeBoundingBox();const {min,max}=geometry.boundingBox;
  geometry.translate(-(min.x+max.x)/2,-(min.y+max.y)/2,-(min.z+max.z)/2);
  geometry.scale(290/(max.x-min.x),290/(max.y-min.y),1);
  // Stable source Chrome coordinates on the actual mesh surface.
  const positions=geometry.attributes.position,uv=geometry.attributes.uv;
  for(let i=0;i<uv.count;i++)uv.setXY(i,(positions.getX(i)+145)/290,(positions.getY(i)+145)/290);
  geometry.computeVertexNormals();return geometry;
}
