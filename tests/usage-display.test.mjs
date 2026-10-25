import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const nativeRequire=createRequire(import.meta.url);
const bundle=await build({entryPoints:[path.resolve(import.meta.dirname,'../client/companion-hub.jsx')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'transform',plugins:[{name:'usage-display-harness',setup(builder){
  builder.onLoad({filter:/client[\\/]companion-hub\.jsx$/},async args=>({contents:`${await readFile(args.path,'utf8')}\nexport {Access,Usage};`,loader:'jsx'}));
  builder.onResolve({filter:/^(react|react-dom\/client|\/js\/)/},args=>({path:args.path,external:true}));
  builder.onResolve({filter:/everyday-activities\.jsx$/},()=>({path:'test-activity-chunk',external:true}));
}}]});
const app=await readFile(new URL('../public/js/app.js',import.meta.url),'utf8');
const usageSetter=app.slice(app.indexOf('function setUsage('),app.indexOf('function applyApprovedPreferences('));
const daily={mode:'daily',text:{limit:20,used:8,remaining:12},speech:{limit:30,used:0,remaining:30}};

function access(initialVisitStatus){
  let changes=0;
  const state=vm.runInNewContext(`let publicUsage=initialVisitStatus?.usage;${usageSetter}\n({snapshot:()=>({usage:publicUsage,owner:false}),setUsage});`,{initialVisitStatus,companionChanged(){changes++;}});
  const mocks={'react-dom/client':{},'/js/visit-scope.js':{visit:{owner:false}},'/js/companion-context.js':{companionBridge:state}};
  const module={exports:{}};
  vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,require:id=>mocks[id]??nativeRequire(id)});
  return {setUsage:state.setUsage,get changes(){return changes;},detail:()=>renderToStaticMarkup(React.createElement(module.exports.Access)),badge:()=>renderToStaticMarkup(React.createElement(module.exports.Usage))};
}

for(const [name,status] of [['first initialization',undefined],['a null status response',{usage:null}]])test(`Access describes unconfirmed allowance during ${name}`,()=>{
  const ui=access(status),detail=ui.detail();
  assert.match(detail,/allowance.*not.*confirmed|checking.*allowance/i);
  assert.doesNotMatch(detail,/daily allowance is not being claimed|Free preview uses/i);
  assert.doesNotMatch(ui.badge(),/Free preview/i);
});

test('temporary allowance status failures keep the unavailable state distinct from preview',()=>{
  const ui=access({usage:{mode:'unavailable',text:{limit:20,used:null,remaining:null},speech:{limit:30,used:null,remaining:null}}});
  assert.match(ui.detail(),/allowance is temporarily unavailable/i);
  assert.match(ui.badge(),/temporarily unavailable/i);
  assert.doesNotMatch(ui.detail(),/daily allowance is not being claimed|Free preview uses/i);
});

test('a null usage update preserves daily counts already shown in the visit',()=>{
  const ui=access({usage:daily});ui.setUsage(null);ui.setUsage(undefined);
  assert.match(ui.detail(),/12 of 20 AI replies remain/);assert.match(ui.badge(),/12 replies left today/);
  assert.equal(ui.changes,0);
});

test('an explicit preview snapshot still explains the short shared limits',()=>{
  const ui=access({usage:{mode:'preview',text:{limit:null,remaining:null},speech:{limit:null,remaining:null}}});
  assert.match(ui.detail(),/Free preview uses short, shared request limits/i);
  assert.match(ui.badge(),/Free preview/);
});
