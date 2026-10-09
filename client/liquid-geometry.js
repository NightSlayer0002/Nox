import {Shape,SphereGeometry} from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {blobPath} from '../public/js/face-art.js';

// Deform Three's sphere (used throughout the R3F demos) to the existing NOX
// outline. Continuous curved depth avoids an extruded plate and bevel rim.
export function createLiquidGeometry(){
  const shape=new Shape();
  blobPath({
    beginPath(){},moveTo:(x,y)=>shape.moveTo(x,-y),
    lineTo:(x,y)=>shape.lineTo(x,-y),closePath:()=>shape.closePath(),
    bezierCurveTo:(x1,y1,x2,y2,x,y)=>shape.bezierCurveTo(x1,-y1,x2,-y2,x,-y),
    quadraticCurveTo:(x1,y1,x,y)=>shape.quadraticCurveTo(x1,-y1,x,-y)
  });
  const outline=shape.getSpacedPoints(128).slice(0,-1);
  const xs=outline.map(p=>p.x),ys=outline.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  for(const p of outline){p.x=(p.x-(minX+maxX)/2)*290/(maxX-minX);p.y=(p.y-(minY+maxY)/2)*290/(maxY-minY);}
  const geometry=new SphereGeometry(1,96,48);geometry.rotateX(Math.PI/2);
  // Stable source Chrome coordinates on the actual mesh surface.
  const positions=geometry.attributes.position,uv=geometry.attributes.uv;
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),y=positions.getY(i),r=Math.hypot(x,y);let radius=0;
    if(r>1e-6){
      const dx=x/r,dy=y/r;
      // Intersect this sphere direction with the existing brand contour.
      for(let j=0;j<outline.length;j++){
        const a=outline[j],b=outline[(j+1)%outline.length],ex=b.x-a.x,ey=b.y-a.y,den=dx*ey-dy*ex;
        if(Math.abs(den)<1e-8)continue;
        const t=(a.x*ey-a.y*ex)/den,u=(a.x*dy-a.y*dx)/den;
        if(t>0&&u>=0&&u<=1)radius=Math.max(radius,t);
      }
    }
    // Ease the contour into circular poles: a flat bottom must not create
    // corner creases all the way across the curved front of the blob.
    const roundedRadius=145+(radius-145)*r**4;
    positions.setXYZ(i,x*roundedRadius,y*roundedRadius,positions.getZ(i)*104);
    uv.setXY(i,(positions.getX(i)+145)/290,(positions.getY(i)+145)/290);
  }
  // Weld the seam and poles after planar UV mapping so normals stay smooth.
  geometry.deleteAttribute('normal');const smooth=mergeVertices(geometry,1e-4);geometry.dispose();
  smooth.computeVertexNormals();return smooth;
}
