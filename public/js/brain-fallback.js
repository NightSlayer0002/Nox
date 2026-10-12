// Exact Lucide brain.svg paths, ISC © 2026 Lucide Icons and Contributors.
// Source and full notice: /vendor/lucide/brain.svg, /vendor/lucide/LICENSE.
export const BRAIN_PATHS=[
  'M12 18V5',
  'M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4',
  'M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5',
  'M17.997 5.125a4 4 0 0 1 2.526 5.77',
  'M18 18a4 4 0 0 0 2-7.464',
  'M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517',
  'M6 18a4 4 0 0 1-2-7.464',
  'M6.003 5.125a4 4 0 0 0-2.526 5.77'
];
let paths;
export function drawBrainFallback(ctx,size,signal){
  paths??=BRAIN_PATHS.map(path=>new Path2D(path));
  ctx.save();ctx.scale(size*.037,size*.037);ctx.translate(-12,-12);
  ctx.lineWidth=.65;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.strokeStyle=signal.color?.[0]===1&&signal.color?.[1]<.2?'#ff9988':'#c7eeeb';
  ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=(signal.intensity??.65)*8;
  for(const path of paths)ctx.stroke(path);
  ctx.restore();
}
