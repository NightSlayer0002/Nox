// Export ARWES's original frame descriptors as a local, transparent SVG.
// Geometry comes from the pinned upstream generator, not NOX drawing code.
import {build} from 'esbuild';
import {writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
await mkdir(path.join(root,'artifacts'),{recursive:true});
const output=path.join(root,'artifacts','arwes-frame-export.mjs');
await build({entryPoints:[path.join(root,'public/vendor/arwes/createFrameCircleSettings.ts')],outfile:output,bundle:true,platform:'node',format:'esm',external:['motion'],alias:{'@arwes/tools':path.join(root,'public/vendor/arwes/filterProps.ts')}});
const {createFrameCircleSettings}=await import(pathToFileURL(output));
const {elements}=createFrameCircleSettings({animated:false,padding:8,strokeWidth:5,separation:6,sideWidth:48});
const size=512;
const value=input=>typeof input==='number'?input:typeof input==='string'&&input.includes('%')?input.replace(/([\d.]+)%/g,(_,n)=>size*Number(n)/100).split(' ').reduce((total,token,index,tokens)=>token==='+'||token==='-'?total:total+(tokens[index-1]==='-'?-1:1)*Number(token),0):input;
const escape=input=>String(input).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const serialize=item=>{
  const attributes={};
  for(const key of ['cx','cy','rx','ry'])if(item[key]!==undefined)attributes[key]=value(item[key]);
  if(item.path)attributes.d=item.path.map(command=>Array.isArray(command)?command.map(value).join(' '):command).join(' ');
  const colors={'var(--arwes-frames-bg-color, currentcolor)':'none','var(--arwes-frames-line-color, currentcolor)':'#38998d','var(--arwes-frames-deco-color, currentcolor)':'#b5f5e4'};
  for(const [key,input] of Object.entries(item.style||{}))if(['fill','stroke','strokeWidth'].includes(key)&&input!==undefined)attributes[key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=colors[input]||input;
  item.draw?.({element:{getAttribute:key=>String(attributes[key]),setAttribute:(key,input)=>{attributes[key]=input;}}});
  const attrs=Object.entries(attributes).map(([key,input])=>`${key}="${escape(input)}"`).join(' ');
  return `<${item.type}${attrs?' '+attrs:''}>${(item.elements||[]).map(serialize).join('')}</${item.type}>`;
};
await writeFile(path.join(root,'public/vendor/arwes/orbit-frame.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><!-- ARWES FrameCircle, bdbaa0324900ee978d42036d1304a053c1fe54b5. MIT. Geometry unchanged; transparent mint palette. -->${elements.map(serialize).join('')}</svg>\n`);
console.log('Exported pinned ARWES FrameCircle artwork.');
