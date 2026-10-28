// Synthetic MPEG-1 Layer III frame envelope (128 kbps, 44.1 kHz). It gives
// transport tests realistic lengths/headers; it is not decoded-audio evidence.
export function fixtureMpeg({tag=false,footer=false}={}){
  const frame=Buffer.alloc(417);frame.set([0xff,0xfb,0x90,0x00]);
  if(!tag)return frame;
  const header=Buffer.from([0x49,0x44,0x33,footer?4:3,0,footer?0x10:0,0,0,0,4]);
  const end=footer?Buffer.from([0x33,0x44,0x49,4,0,0x10,0,0,0,4]):Buffer.alloc(0);
  return Buffer.concat([header,Buffer.alloc(4),end,frame]);
}
