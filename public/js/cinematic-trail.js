// MeshLine's clip-space width expands with height and inverse aspect ratio.
// Bound its widest projected direction, including turns, in CSS pixels.
export function cinematicTrailWidth(width,height,{compact=false}={}){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return 0;
  if(!compact)return .5;
  const aspect=width/height,maxPixels=14;
  return Math.min(.5,2*maxPixels*aspect/Math.max(width,height));
}
