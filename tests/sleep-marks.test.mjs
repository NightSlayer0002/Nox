import test from 'node:test';
import assert from 'node:assert/strict';
import {drawEyes} from '../public/js/face-art.js';

const sleepy={expression:'sleepy',eyeStyle:'closed',leftHeight:18,rightHeight:18,marks:'sleep'};

// Record text sent to the canvas by the real renderer. A full em is a
// conservative ascent for the lowercase z, so the bounds also allow font swaps.
function sleepMarks(time,{reduceMotion=false,opacity=1}={}){
  const marks=[],stack=[];
  const ctx={
    globalAlpha:opacity,
    beginPath(){},moveTo(){},quadraticCurveTo(){},stroke(){},
    save(){stack.push({globalAlpha:this.globalAlpha,font:this.font,textAlign:this.textAlign,shadowBlur:this.shadowBlur});},
    restore(){Object.assign(this,stack.pop());},
    fillText(text,x,y){marks.push({text,x,y,fontSize:Number(this.font.match(/([\d.]+)px/)[1]),alpha:this.globalAlpha,shadowBlur:this.shadowBlur});},
  };
  drawEyes(ctx,sleepy,0,0,time,'#fff3c9',reduceMotion);
  assert.equal(ctx.globalAlpha,opacity,'sleep marks must restore the face opacity');
  return marks;
}

test('sleep marks stay large enough to read and grow along the diagonal',()=>{
  const marks=sleepMarks(0,{reduceMotion:true});
  assert.equal(marks.length,3);
  assert.ok(marks.every(mark=>mark.text==='z'));
  assert.ok(marks[0].fontSize>=20,'the smallest sleep mark needs a readable size');
  for(let i=1;i<marks.length;i++){
    assert.ok(marks[i].fontSize>=marks[i-1].fontSize+4,'the diagonal should grow clearly');
    assert.ok(marks[i].x-marks[i-1].x>=20,'the larger marks need room beside each other');
    assert.ok(marks[i].y<marks[i-1].y,'sleep marks should rise along the diagonal');
  }
});

test('visible sleep marks fit the desktop and phone floating canvases throughout a cycle',()=>{
  for(const {size,margin} of [{size:256,margin:8},{size:160,margin:5}]){
    const unit=Math.min(size/720,size/560)*1.85;
    for(let frame=0;frame<=300;frame++){
      const time=frame/96;
      for(const mark of sleepMarks(time)){
        if(mark.alpha<=.001)continue;
        // Include the glow and the face's maximum upward breathing offset.
        const top=size*.51+(mark.y-mark.fontSize-mark.shadowBlur-3.5)*unit;
        const right=size*.5+(mark.x+mark.fontSize/2+mark.shadowBlur)*unit;
        assert.ok(top>=margin,`${size}px canvas clips a sleep mark at ${time}s: top=${top}`);
        assert.ok(right<=size-margin,`${size}px canvas clips the right side of a sleep mark`);
      }
    }
  }
});

test('each moving sleep mark fades out before its cycle wraps and fades back in',()=>{
  for(let i=0;i<3;i++){
    const reset=(1-i/3)/.32;
    const before=sleepMarks(reset-.001)[i],after=sleepMarks(reset+.001)[i];
    assert.ok(before.alpha<.001,`sleep mark ${i} should disappear before resetting`);
    assert.ok(after.alpha<.001,`sleep mark ${i} should fade in after resetting`);
    assert.ok(sleepMarks(reset-.5/.32)[i].alpha>.7,'a mark remains clear mid-cycle');
  }
});

test('reduced motion keeps all sleep marks visible and stationary',()=>{
  const start=sleepMarks(0,{reduceMotion:true,opacity:.5});
  assert.deepEqual(sleepMarks(100,{reduceMotion:true,opacity:.5}),start);
  assert.ok(start.every(mark=>mark.alpha>=.35),'reduced motion must not freeze an invisible phase');
});
