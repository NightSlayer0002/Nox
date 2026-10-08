import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSourceProgram} from '../public/js/source-effects.js';
function context({compile=true,link=true}={}){const deleted=[];let next=0;return {deleted,VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,createShader:()=>++next,shaderSource(){},compileShader(){},getShaderParameter:()=>compile,getShaderInfoLog:()=> 'bad shader',deleteShader:s=>deleted.push(['shader',s]),createProgram:()=>++next,attachShader(){},linkProgram(){},getProgramParameter:()=>link,getProgramInfoLog:()=> 'bad link',deleteProgram:p=>deleted.push(['program',p])};}
test('source shaders release temporary shader objects after a successful link',()=>{const gl=context();assert.equal(compileSourceProgram(gl,'vertex','fragment'),3);assert.deepEqual(gl.deleted,[['shader',1],['shader',2]]);});
test('shader compilation failure releases already allocated resources',()=>{const gl=context({compile:false});assert.throws(()=>compileSourceProgram(gl,'vertex','fragment'),/bad shader/);assert.deepEqual(gl.deleted,[['shader',1]]);});
test('link failure releases both shaders and the failed program',()=>{const gl=context({link:false});assert.throws(()=>compileSourceProgram(gl,'vertex','fragment'),/bad link/);assert.equal(gl.deleted.filter(v=>v[0]==='shader').length,2);assert.equal(gl.deleted.filter(v=>v[0]==='program').length,1);});
