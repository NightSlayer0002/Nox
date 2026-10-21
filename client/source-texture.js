import {CanvasTexture,SRGBColorSpace,LinearFilter} from 'three';

// Three allocates immutable GPU storage on first upload. A resized source
// canvas needs a new texture, even though its JavaScript identity is unchanged.
export function createSurfaceTexture({anisotropy=1}={}){
  let texture=null,source=null,width=0,height=0,disposed=false;
  const detail=Number.isFinite(anisotropy)?Math.max(1,Math.min(4,anisotropy)):1;
  return {update(canvas){
    if(disposed)return null;
    if(!texture||source!==canvas||width!==canvas.width||height!==canvas.height){
      const previous=texture;
      texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
      // This source is redrawn in another WebGL context. Sample its current
      // level directly; generated mip levels can conceal the moving surface.
      texture.generateMipmaps=false;texture.minFilter=texture.magFilter=LinearFilter;texture.anisotropy=detail;
      source=canvas;width=canvas.width;height=canvas.height;previous?.dispose();
    }else texture.needsUpdate=true;
    return texture;
  },dispose(){if(disposed)return;disposed=true;texture?.dispose();texture=null;source=null;}};
}

