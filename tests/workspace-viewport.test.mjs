import test from 'node:test';
import assert from 'node:assert/strict';
import {attachWorkspaceViewport} from '../public/js/workspace-viewport.js';
function fixture(){
  const viewport=Object.assign(new EventTarget(),{height:800,scale:1});
  const style={setProperty:(key,value)=>{style[key]=value;},removeProperty:key=>{delete style[key];}},body={dataset:{}},windowTarget=Object.assign(new EventTarget(),{innerHeight:800});
  const dispose=attachWorkspaceViewport({viewport,style,body,windowTarget});return{viewport,style,body,windowTarget,dispose};
}
test('workspace fits the keyboard viewport and restores its full height afterwards',()=>{
  const {viewport,style,body,dispose}=fixture();viewport.height=360;viewport.dispatchEvent(new Event('resize'));
  assert.equal(style['--workspace-height'],'360px');assert.equal(body.dataset.keyboardOpen,'true');
  viewport.height=800;viewport.dispatchEvent(new Event('resize'));assert.equal(body.dataset.keyboardOpen,'false');assert.equal(style['--workspace-height'],'800px');dispose();
});
test('pinch zoom and invalid viewport values cannot collapse the workspace',()=>{
  const {viewport,style,dispose}=fixture();
  for(const [height,scale] of [[360,2],[NaN,1],[0,1]]){Object.assign(viewport,{height,scale});viewport.dispatchEvent(new Event('resize'));assert.equal(style['--workspace-height'],'800px');}
  dispose();viewport.height=300;viewport.scale=1;viewport.dispatchEvent(new Event('resize'));assert.equal(style['--workspace-height'],undefined);
});
test('page restoration refreshes dimensions while disposal removes all listeners',()=>{
  const {viewport,style,windowTarget,dispose}=fixture();viewport.height=500;windowTarget.dispatchEvent(new Event('pageshow'));assert.equal(style['--workspace-height'],'500px');dispose();
  windowTarget.dispatchEvent(new Event('pageshow'));assert.equal(style['--workspace-height'],undefined);
  assert.doesNotThrow(()=>attachWorkspaceViewport({viewport:null})());
});
