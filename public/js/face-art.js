// The expression sheet is drawn as paths, not image swaps. NOX keeps two eyes
// and one mouth; brows, lids and small marks carry the reference's acting.
export const EXPRESSIONS = Object.freeze({
  neutral:{eyes:'pill',heights:[1,1]},curious:{eyes:'pill',heights:[1,1]},
  happy:{eyes:'arc',heights:[.73,.73]},content:{eyes:'arc',heights:[.55,.55]},
  skeptical:{eyes:'half',heights:[.44,.83],brows:'skeptical'},annoyed:{eyes:'half',heights:[.3,.3],brows:'angry'},
  sleepy:{eyes:'closed',heights:[.18,.18]},yawning:{eyes:'closed',heights:[.18,.18]},
  uncanny:{eyes:'pill',heights:[1.06,1.06]},surprised:{eyes:'ring',heights:[1.14,1.14],brows:'raised'},
  shy:{eyes:'arc',heights:[.6,.6],marks:'blush'},worried:{eyes:'pill',heights:[.6,.64],brows:'worried',marks:'sweat'},
  dizzy:{eyes:'spiral',heights:[.8,.8],marks:'stars'},ouch:{eyes:'squeezed',heights:[.5,.5]},
  excited:{eyes:'star',heights:[.8,.8]},mischievous:{eyes:'half',heights:[.4,.68],brows:'skeptical'},
  thinking:{eyes:'half',heights:[.58,.82],brows:'curious'},listening:{eyes:'pill',heights:[1.05,1.05],brows:'raised'},
  confused:{eyes:'pill',heights:[.55,.95],brows:'worried',marks:'question'},
  pout:{eyes:'glossy',heights:[1.12,1.12],brows:'furrowed',marks:'anger'},
});

export function drawBody(ctx,held){
  ctx.fillStyle=held?'#00000035':'#00000065';ctx.shadowColor='#000';ctx.shadowBlur=held?20:12;
  ctx.beginPath();ctx.ellipse(0,151,140,15,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  // Restore the original continuous blob outline, with a quiet matte finish.
  ctx.beginPath();ctx.moveTo(-145,126);
  ctx.bezierCurveTo(-148,52,-141,-61,-102,-106);
  ctx.bezierCurveTo(-55,-165,67,-165,111,-97);
  ctx.bezierCurveTo(145,-47,148,59,145,126);
  ctx.quadraticCurveTo(143,145,124,145);ctx.lineTo(-124,145);
  ctx.quadraticCurveTo(-145,145,-145,126);ctx.closePath();
  const matte=ctx.createLinearGradient(-140,-130,145,130);matte.addColorStop(0,'#232924');matte.addColorStop(1,'#0e1512');
  ctx.fillStyle=matte;ctx.fill();ctx.strokeStyle='#61706655';ctx.lineWidth=1.5;ctx.stroke();
  ctx.save();ctx.clip();ctx.fillStyle='#acb6a410';
  for(let i=0;i<55;i++){const x=((i*73)%239)-119,y=((i*109)%291)-146;ctx.fillRect(x,y,1.3,1.3);}
  ctx.restore();
}

function star(ctx,x,y,r){
  ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.44:r;const px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();
}

function glossyEye(ctx,x,y,h,gazeX,gazeY){
  ctx.save();ctx.shadowBlur=0;
  ctx.beginPath();ctx.ellipse(x,y,32,h*.48,0,0,Math.PI*2);ctx.fillStyle='#f7f1df';ctx.fill();
  ctx.strokeStyle='#14212b';ctx.lineWidth=4;ctx.stroke();ctx.clip();
  const ix=x+gazeX*.16,iy=y+gazeY*.12;
  const iris=ctx.createRadialGradient(ix,iy+15,1,ix,iy,32);
  iris.addColorStop(0,'#6edacc');iris.addColorStop(.48,'#278dba');iris.addColorStop(1,'#172653');
  ctx.fillStyle=iris;ctx.beginPath();ctx.ellipse(ix,iy,28,39,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#10172a';ctx.beginPath();ctx.ellipse(ix,iy-3,21,29,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#a2ece080';ctx.lineWidth=2;ctx.beginPath();ctx.arc(ix,iy+6,24,.2,Math.PI-.2);ctx.stroke();
  ctx.fillStyle='#fffef6';ctx.beginPath();ctx.ellipse(ix-8,iy-16,12,17,-.12,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(ix+15,iy+18,5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(ix-17,iy+16,3,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

export function drawEyes(ctx,f,gazeX,gazeY,time,color,reduceMotion){
  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=5;ctx.lineCap='round';ctx.lineJoin='round';
  for(let side=0;side<2;side++){
    const classic=['neutral','curious'].includes(f.expression),spacing=classic?57:47,eyeWidth=classic?46:38;
    const x=(side?spacing:-spacing)+gazeX,h=(side?f.rightHeight:f.leftHeight)*(classic?1:.82);
    if(h<5||f.eyeStyle==='closed'){ctx.beginPath();ctx.moveTo(x-17,gazeY+3);ctx.quadraticCurveTo(x,gazeY+10,x+17,gazeY+3);ctx.stroke();}
    else if(f.eyeStyle==='glossy')glossyEye(ctx,x,gazeY,h,gazeX,gazeY);
    else if(f.eyeStyle==='spiral'){
      ctx.beginPath();const phase=reduceMotion?0:Math.sin(time*.8)*.16;
      for(let i=0;i<=55;i++){const a=i/55*Math.PI*5+phase,r=2+i/55*23;const px=x+Math.cos(a)*r,py=gazeY+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();
    }else if(f.eyeStyle==='star')star(ctx,x,gazeY,27);
    else if(f.eyeStyle==='arc'){ctx.beginPath();ctx.moveTo(x-20,gazeY+8);ctx.quadraticCurveTo(x,gazeY-17,x+20,gazeY+8);ctx.stroke();}
    else if(f.eyeStyle==='squeezed'){const d=side?-1:1;ctx.beginPath();ctx.moveTo(x-d*19,gazeY-19);ctx.lineTo(x+d*13,gazeY);ctx.lineTo(x-d*19,gazeY+19);ctx.stroke();}
    else {
      const y=gazeY-h/2+(f.eyeStyle==='half'&&!side?9:0);
      ctx.beginPath();ctx.roundRect(x-eyeWidth/2,y,eyeWidth,Math.max(3,h),f.eyeStyle==='half'?8:eyeWidth/2);
      f.eyeStyle==='ring'?ctx.stroke():ctx.fill();
    }
    const browY=gazeY-Math.max(23,h/2)-13;
    if(f.brows){
      ctx.lineWidth=3;ctx.beginPath();
      if(f.brows==='angry'){ctx.moveTo(x-22,browY+(side?8:0));ctx.lineTo(x+22,browY+(side?0:8));}
      else if(f.brows==='furrowed'){ctx.lineWidth=5;ctx.moveTo(x-30,browY+(side?11:0));ctx.quadraticCurveTo(x,browY+9,x+30,browY+(side?0:11));}
      else if(f.brows==='worried'){ctx.moveTo(x-20,browY+(side?0:9));ctx.quadraticCurveTo(x,browY-7,x+20,browY+(side?9:0));}
      else if(f.brows==='raised'){ctx.moveTo(x-18,browY+3);ctx.quadraticCurveTo(x,browY-10,x+18,browY+3);}
      else if(!side){ctx.moveTo(x-20,browY+4);ctx.quadraticCurveTo(x,browY-7,x+20,browY-3);}
      ctx.stroke();ctx.lineWidth=5;
    }
  }
  ctx.lineWidth=2.5;ctx.shadowBlur=2;
  if(f.marks==='blush')for(const side of [-1,1])for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(side*77+i*5,40);ctx.lineTo(side*77+i*5-3,49);ctx.stroke();}
  if(f.marks==='stars'){for(const [x,y,r] of [[-78,-150,5],[10,-169,4],[83,-142,5]])star(ctx,x,y,r);}
  if(f.marks==='question'){ctx.font='24px Manrope, sans-serif';ctx.fillText('?',85,-80);}
  if(f.marks==='sweat'){ctx.beginPath();ctx.moveTo(91,-32);ctx.quadraticCurveTo(81,-11,91,-12);ctx.quadraticCurveTo(99,-13,91,-32);ctx.stroke();}
  if(f.marks==='anger'){
    ctx.save();ctx.translate(88,-111);ctx.strokeStyle='#f07c68';ctx.shadowColor='#d85440';ctx.shadowBlur=3;ctx.lineWidth=4;
    for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(5,-5);ctx.lineTo(5,-16);ctx.lineTo(16,-16);ctx.stroke();ctx.rotate(Math.PI/2);}ctx.restore();
  }
}

export function drawMouth(ctx,f,gazeX,gazeY,color){
  const x=gazeX*.25,y=68+gazeY*.15;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=3.5;ctx.lineCap='round';ctx.beginPath();
  const mouth=f.mouth;
  if(mouth==='talking'){ctx.ellipse(x,y,10+f.open*.22,f.open/2,0,0,Math.PI*2);ctx.fill();return;}
  if(['happy','content','shy'].includes(mouth)){const w=mouth==='shy'?11:mouth==='content'?16:25;ctx.moveTo(x-w,y-5);ctx.quadraticCurveTo(x,y+17,x+w,y-5);}
  else if(['skeptical','mischievous'].includes(mouth)){ctx.moveTo(x-16,y+4);ctx.quadraticCurveTo(x+4,y+8,x+24,y-8);}
  else if(['annoyed','worried','confused'].includes(mouth)){ctx.moveTo(x-19,y+9);ctx.quadraticCurveTo(x,y-10,x+19,y+6);}
  else if(mouth==='excited'){ctx.moveTo(x-27,y-7);ctx.quadraticCurveTo(x,y+30,x+27,y-7);ctx.quadraticCurveTo(x,y+1,x-27,y-7);ctx.fill();return;}
  else if(mouth==='dizzy'){ctx.moveTo(x-24,y+3);ctx.bezierCurveTo(x-10,y-10,x-6,y+13,x+7,y+2);ctx.quadraticCurveTo(x+17,y-8,x+24,y+2);}
  else if(mouth==='ouch'){ctx.moveTo(x-18,y);ctx.lineTo(x-6,y+7);ctx.lineTo(x+6,y-4);ctx.lineTo(x+18,y+3);}
  else if(mouth==='pout'){ctx.moveTo(x-22,y+9);ctx.quadraticCurveTo(x-19,y-13,x-5,y-6);ctx.quadraticCurveTo(x,y-3,x+7,y-7);ctx.quadraticCurveTo(x+19,y-12,x+23,y+9);ctx.quadraticCurveTo(x,y+18,x-22,y+9);ctx.stroke();ctx.beginPath();ctx.moveTo(x-17,y+6);ctx.lineTo(x-11,y+2);ctx.lineTo(x-6,y+7);ctx.moveTo(x+6,y+6);ctx.lineTo(x+11,y+2);ctx.lineTo(x+17,y+6);}
  else if(mouth==='yawning'){ctx.ellipse(x,y,15,21,0,0,Math.PI*2);ctx.stroke();return;}
  else if(mouth==='surprised'){ctx.ellipse(x,y,10,14,0,0,Math.PI*2);ctx.fill();return;}
  else if(['rest','uncanny','thinking','sleepy'].includes(mouth)){ctx.moveTo(x-10,y);ctx.lineTo(x+10,y+(mouth==='thinking'?-4:0));}
  else {const classic=['neutral','curious'].includes(mouth);ctx.ellipse(x,y,classic?10:8,classic?6:5,0,0,Math.PI*2);ctx.fill();return;}
  ctx.stroke();
}
