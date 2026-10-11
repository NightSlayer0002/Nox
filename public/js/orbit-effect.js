// Canvas adapter for the vendored ARWES FrameCircle SVG (MIT).
// Only placement/rotation is owned here; all visible artwork is upstream.
const ASSET='/vendor/arwes/orbit-frame.svg';
export function orbitPose(character,width,height){
  return {x:character.x*width,y:character.y*height,size:Math.min(character.diameter(width,height)*1.65,width*.92,height*.85)};
}
function loadSourceImage(){
  return new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Orbit artwork unavailable'));image.src=ASSET;
  });
}
export function createOrbitEffect({loadImage=loadSourceImage}={}){
  let image=null,disposed=false;
  const ready=loadImage().then(asset=>{if(!disposed)image=asset;}).catch(()=>{});
  return {ready,
    draw(ctx,character,width,height,age,reduced,layer){
      if(!image||disposed||width<=0||height<=0)return false;
      const pose=orbitPose(character,width,height),time=reduced?0:age;
      const enter=reduced?1:Math.min(1,Math.max(0,age/.6));
      for(const [tilt,flatten,speed,scale] of [[-.28,.4,.24,1],[.95,.48,-.17,.9]]){
        const size=pose.size*scale;
        ctx.save();ctx.translate(pose.x,pose.y);ctx.rotate(tilt);ctx.scale(1,flatten);
        ctx.beginPath();ctx.rect(-size,-size*(layer==='back'?1:0),size*2,size);ctx.clip();
        ctx.globalAlpha=enter*(layer==='front'?1:.6);ctx.shadowColor='#55c9bc';ctx.shadowBlur=layer==='front'?9:3;
        ctx.rotate(time*speed);ctx.drawImage(image,-size/2,-size/2,size,size);ctx.restore();
      }
      return true;
    },
    dispose(){disposed=true;image=null;}
  };
}
