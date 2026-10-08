// WebGL lifecycle adapter for the original liquid-logo / liquid-glass-js shaders.
// Upstream GLSL is in /vendor, with its license and pinned source commit.
export function createFrameBudget(fps=30){const interval=1000/Math.max(1,Math.min(60,fps));let last=-Infinity;return now=>{if(!Number.isFinite(now))return false;if(now<last||now-last>=interval){last=now;return true;}return false;};}
export function compileSourceProgram(gl,vertex,fragment){
  const shaders=[];let program;
  try{
    for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
      const shader=gl.createShader(type);if(!shader)throw Error('Shader allocation failed');shaders.push(shader);
      gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)||'Shader compilation failed');
    }
    program=gl.createProgram();if(!program)throw Error('Program allocation failed');
    for(const shader of shaders)gl.attachShader(program,shader);
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'Shader link failed');
    return program;
  }catch(error){if(program)gl.deleteProgram(program);throw error;}
  finally{for(const shader of shaders)gl.deleteShader(shader);}
}
const shaderCache=new Map();
export function sourceShader(url){
  if(!shaderCache.has(url))shaderCache.set(url,fetch(url).then(async response=>{if(!response.ok)throw Error('Source shader unavailable');return response.text();}).catch(error=>{shaderCache.delete(url);throw error;}));
  return shaderCache.get(url);
}
export async function createLiquidLogoRenderer(canvas=document.createElement('canvas')){
  const gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:true,depth:false,powerPreference:'low-power'});
  if(!gl)throw Error('WebGL unavailable');
  const [vertex,fragment]=await Promise.all([sourceShader('/vendor/liquid-logo/vertex-shader.glsl'),sourceShader('/vendor/liquid-logo/fragment-shader.glsl')]);
  const program=compileSourceProgram(gl,vertex,fragment),buffer=gl.createBuffer(),texture=gl.createTexture();
  gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'aVertexPosition');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  gl.bindTexture(gl.TEXTURE_2D,texture);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
  for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
  // Chrome preset from upstream presets.js; contrast/color tuned for NOX's body.
  const values={speed:.4,iterations:15,scale:3.12,dotFactor:.04,dotMultiplier:.21,vOffset:5.1,intensityFactor:.18,expFactor:.6,colorShift:.9,logoInteractStrength:.4,noiseIntensity:.12,logoOpacity:1,logoScale:1,logoAspectRatio:1};
  const uniforms=Object.fromEntries([...Object.keys(values),'time','resolution','colorFactors','logoTexture','logoBlendMode'].map(key=>[key,gl.getUniformLocation(program,`u_${key}`)]));
  for(const [key,value] of Object.entries(values))gl.uniform1f(uniforms[key],value);
  gl.uniform3f(uniforms.colorFactors,.9,.9,.9);gl.uniform1i(uniforms.logoTexture,0);gl.uniform1i(uniforms.logoBlendMode,0);
  let disposed=false,lastMask,lost=false;
  const onLost=event=>{event.preventDefault();lost=true;};const onRestored=()=>api.onRestore?.();
  canvas.addEventListener('webglcontextlost',onLost);canvas.addEventListener('webglcontextrestored',onRestored);
  const api={canvas,onRestore:null,render(mask,time){
    if(disposed||lost||gl.isContextLost())return false;
    const size=Math.min(512,Math.max(64,mask.width));if(canvas.width!==size||canvas.height!==size){canvas.width=size;canvas.height=size;}
    gl.viewport(0,0,size,size);gl.useProgram(program);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);if(lastMask!==mask){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,mask);lastMask=mask;}
    gl.uniform2f(uniforms.resolution,size,size);gl.uniform1f(uniforms.time,time);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return true;
  },dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',onLost);canvas.removeEventListener('webglcontextrestored',onRestored);gl.deleteBuffer(buffer);gl.deleteTexture(texture);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();}};
  return api;
}
