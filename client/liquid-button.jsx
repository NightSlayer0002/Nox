// Adapted from dashersw/liquid-glass-js Container.initWebGL / Button.
// Original shader; native HTML supplies focus and keyboard access.
import React,{useEffect,useRef} from 'react';
import {compileSourceProgram,sourceShader} from '/js/source-effects.js';
export function LiquidButton({children,onClick,source,href,className='',pressed,...controls}){
  const canvas=useRef();
  useEffect(()=>{
    if(!source)return;
    let disposed=false,frame=0,program,buffer,tex;const surface=canvas.current;
    const gl=surface.getContext('webgl',{alpha:true,antialias:false,powerPreference:'low-power'});if(!gl)return;
    async function init(){
      const shaders=await Promise.all([sourceShader('/vendor/liquid-glass-js/glass.vert'),sourceShader('/vendor/liquid-glass-js/glass.frag')]);if(disposed)return;
      program=compileSourceProgram(gl,...shaders);gl.useProgram(program);
      buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,0,1,1,-1,1,1,-1,1,0,0,-1,1,0,0,1,-1,1,1,1,1,1,0]),gl.STATIC_DRAW);
      for(const [name,offset] of [['a_position',0],['a_texcoord',8]]){const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,16,offset);}
      tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
      for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
      for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
      const uniform=name=>gl.getUniformLocation(program,`u_${name}`);
      const defaults={blurRadius:2,borderRadius:26,warp:0,edgeIntensity:.01,rimIntensity:.05,baseIntensity:.01,edgeDistance:.15,rimDistance:.8,baseDistance:.1,cornerBoost:.02,rippleEffect:.1,tintOpacity:.25,scrollY:0,image:0};
      for(const [key,value] of Object.entries(defaults))key==='image'?gl.uniform1i(uniform(key),value):gl.uniform1f(uniform(key),value);
      let last=0;
      const draw=now=>{if(disposed)return;frame=requestAnimationFrame(draw);if(document.hidden||now-last<80||!source?.width)return;last=now;
        const box=surface.getBoundingClientRect();if(!box.width||box.bottom<0||box.top>innerHeight)return;
        const w=Math.ceil(box.width),h=Math.ceil(box.height);if(surface.width!==w||surface.height!==h){surface.width=w;surface.height=h;}
        gl.viewport(0,0,w,h);gl.useProgram(program);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
        gl.uniform2f(uniform('resolution'),w,h);gl.uniform2f(uniform('textureSize'),innerWidth,innerHeight);gl.uniform2f(uniform('containerPosition'),box.left+w/2,box.top+h/2);
        gl.uniform1f(uniform('pageHeight'),innerHeight);gl.uniform1f(uniform('viewportHeight'),innerHeight);gl.drawArrays(gl.TRIANGLES,0,6);surface.dataset.effect='liquid-glass-js';
      };frame=requestAnimationFrame(draw);
    }
    init().catch(error=>{surface.dataset.effect='fallback';surface.dataset.error=error.message;surface.hidden=true;});
    return()=>{disposed=true;cancelAnimationFrame(frame);if(buffer)gl.deleteBuffer(buffer);if(tex)gl.deleteTexture(tex);if(program)gl.deleteProgram(program);};
  },[source]);
  const Tag=href?'a':'button';
  return <Tag {...controls} href={href} type={href?undefined:'button'} onClick={onClick} aria-pressed={pressed} className={`glass-button liquid-button ${className}`}><canvas ref={canvas} aria-hidden="true"/><span>{children}</span></Tag>;
}
