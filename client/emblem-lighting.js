import * as THREE from 'three';

// One static studio reflection, shared by the eyes and smile. It costs no
// per-frame drawing and follows the same palette as the surrounding page.
export function createEmblemEnvironment(palette){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#101b22';ctx.fillRect(0,0,1024,512);
  const fill=(x,y,rx,ry,color)=>{
    ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
    const light=ctx.createRadialGradient(0,0,0,0,0,1);
    light.addColorStop(0,color);light.addColorStop(1,'transparent');
    ctx.fillStyle=light;ctx.fillRect(-1,-1,2,2);ctx.restore();
  };
  fill(260,280,360,310,palette.teal);
  fill(770,240,350,320,palette.violet);
  // Broad softboxes make curved metal legible rather than neon-edged.
  fill(480,115,260,110,'#eff5e7');
  fill(100,260,70,240,'#a7d4ce');
  fill(920,300,65,220,'#baa9d9');
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.mapping=THREE.EquirectangularReflectionMapping;
  return texture;
}
