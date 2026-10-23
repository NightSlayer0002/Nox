import test from 'node:test';
import assert from 'node:assert/strict';
import {attachFloatingPresence} from '../public/js/floating-presence.js';
import {Face} from '../public/js/face.js';
import {blobPath} from '../public/js/face-art.js';

function silhouette(){
  const points=[];let x=0,y=0;
  const lineTo=(nextX,nextY)=>{x=nextX;y=nextY;points.push({x,y});};
  blobPath({beginPath(){},closePath(){},moveTo:lineTo,lineTo,
    bezierCurveTo(ax,ay,bx,by,nextX,nextY){const fromX=x,fromY=y;for(let step=1;step<=40;step++){const t=step/40,s=1-t;lineTo(s*s*s*fromX+3*s*s*t*ax+3*s*t*t*bx+t*t*t*nextX,s*s*s*fromY+3*s*s*t*ay+3*s*t*t*by+t*t*t*nextY);}},
    quadraticCurveTo(ax,ay,nextX,nextY){const fromX=x,fromY=y;for(let step=1;step<=40;step++){const t=step/40,s=1-t;lineTo(s*s*fromX+2*s*t*ax+t*t*nextX,s*s*fromY+2*s*t*ay+t*t*nextY);}},
  });return points;
}

// Only the browser boundary is substituted. The placement, gravity, follower,
// pointer handlers, and character pose are the production implementations.
class Element extends EventTarget{
  constructor(rect={}){super();this.rect=rect;this.children=[];this.dataset={};this.attributes={};this.style={setProperty(name,value){this[name]=value;}};this.classList={contains:()=>false,add(){}};this.open=false;this.tabIndex=0;}
  append(...nodes){for(const node of nodes){node.remove?.();node.parent=this;this.children.push(node);}}
  before(node){this.parent?.append(node);}
  after(node){this.parent?.append(node);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}
  setAttribute(name,value){this.attributes[name]=value;}
  getBoundingClientRect(){return this.rect;}
  setPointerCapture(id){this.capture=id;}
  hasPointerCapture(id){return this.capture===id;}
  releasePointerCapture(){this.capture=null;}
}

function fixture({reduced=true,override=true,compact=false}={}){
  const body=new Element(),doc=Object.assign(new EventTarget(),{body,documentElement:new Element(),activeElement:null});
  body.dataset={view:'conversation',presence:'visible',callOpen:'false'};
  const elements={world:new Element(),'presence-toolbar':new Element(),'presence-menu':new Element(),'presence-menu-panel':new Element(),'presence-toggle':new Element(),'workspace-shell':new Element({left:184,right:1440}),'chat-form':new Element({top:780,right:1272}),'mobile-bottom-nav':new Element({height:0})};
  for(const element of Object.values(elements))body.append(element);
  const header=new Element({bottom:64}),welcome=new Element({top:150,height:360,right:1272});
  doc.getElementById=id=>elements[id];doc.querySelector=selector=>({'.header':header,'.companion-welcome':welcome}[selector]??null);
  doc.createElement=doc.createElementNS=()=>new Element();doc.createComment=doc.createTextNode=()=>new Element();
  const media={reduced:Object.assign(new EventTarget(),{matches:reduced}),compact:Object.assign(new EventTarget(),{matches:compact})};
  const frames=new Map();let nextFrame=0;
  const win=Object.assign(new EventTarget(),{innerWidth:1440,innerHeight:900,matchMedia:query=>query.includes('max-width')?media.compact:media.reduced,getComputedStyle:()=>({display:'none'}),requestAnimationFrame:callback=>{frames.set(++nextFrame,callback);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id),MutationObserver:class{observe(){}disconnect(){}},ResizeObserver:class{observe(){}disconnect(){}}});
  const stage={canvas:new Element(),character:new Face(),form:'face',scene:null,time:0,motionOverride:override,reduceMotion:override===null?reduced:!override,resize(){}};
  const presence=attachFloatingPresence({stage,documentTarget:doc,windowTarget:win});
  const layer=body.children.find(child=>child.className==='floating-ui'),handle=elements.world.children.find(child=>child.className==='floating-nox-handle');
  function tick(count=1){for(let i=0;i<count;i++){stage.time+=1/60;stage.onBeforeFrame(stage.time,1/60);}}
  function fire(type,point){const event=Object.assign(new Event(type,{cancelable:true}),{button:0,pointerId:1,clientX:point.x,clientY:point.y});handle.dispatchEvent(event);}
  return {stage,presence,layer,elements,doc,media,tick,fire,measure(){for(const callback of frames.values())callback();frames.clear();}};
}

test('an explicit motion preference keeps dragging follower and gravity animated on a reduced-motion platform',()=>{
  const f=fixture();try{
    const start={x:f.presence.state.x,y:f.presence.state.y},toolbar=f.elements['presence-toolbar'];
    const first=toolbar.style.transform;
    f.fire('pointerdown',{x:start.x+50,y:start.y+50});
    f.fire('pointermove',{x:start.x-150,y:start.y-50});f.tick(3);
    assert.notEqual(toolbar.style.transform,first,'the controls travel with the dragged character');
    const trail=f.layer.children.find(child=>child.classList&&child.children.length===23);
    assert.ok(trail.children.some(line=>Number(line.style.opacity)>0),'drag motion leaves a visible trail');
    assert.equal(f.layer.dataset.motion,'full','CSS receives the same effective motion policy');
    f.fire('pointerup',{x:0,y:0});
    const released=f.presence.state.y;f.stage.scene={action:'gravity'};f.tick();
    assert.ok(f.presence.state.y>released&&f.presence.state.y<600,'gravity visibly falls from its release position');
  }finally{f.presence.dispose();}
});

test('the platform default remains reduced when no explicit motion preference exists',()=>{
  const f=fixture({override:null});try{
    f.stage.scene={action:'gravity'};f.tick();
    assert.equal(f.presence.state.grounded,true);assert.equal(f.presence.state.vy,0);
    assert.equal(f.layer.dataset.motion,'reduced');
  }finally{f.presence.dispose();}
});

test('motion preference changes during a visit apply to gravity and the bot without a resize',()=>{
  const f=fixture({reduced:false,override:true});try{
    f.stage.scene={action:'gravity'};f.tick();
    assert.equal(f.presence.state.grounded,false);
    f.stage.motionOverride=false;f.stage.reduceMotion=true;f.tick();
    assert.equal(f.presence.state.grounded,true);assert.equal(f.presence.state.vy,0);
    assert.equal(f.layer.dataset.motion,'reduced');
  }finally{f.presence.dispose();}
});

test('a fresh welcome placement stays where the user drags it while typing, with Park explicitly returning it to the composer',()=>{
  const f=fixture();try{
    assert.equal(f.presence.state.size,208);
    assert.equal(f.presence.state.y,226);
    f.fire('pointerdown',{x:1066,y:252});f.fire('pointermove',{x:600,y:350});f.fire('pointerup',{x:600,y:350});f.tick();
    const placement={x:f.presence.state.x,y:f.presence.state.y};
    f.doc.activeElement={tagName:'TEXTAREA'};f.elements['chat-form'].rect.top=650;
    f.doc.dispatchEvent(new Event('focusin'));f.measure();f.tick(120);
    assert.equal(f.presence.state.x,placement.x);assert.equal(f.presence.state.y,placement.y);
    f.presence.park();assert.ok(f.presence.state.y>placement.y);
    assert.equal(f.presence.state.x+f.presence.state.size,1272);
  }finally{f.presence.dispose();}
});

test('the floating pose retains headroom through held tilt and leaves a proportionate visible silhouette',()=>{
  for(const compact of [false,true]){
    const f=fixture({compact});try{
      f.tick();const face=f.stage.character,size=f.presence.state.size;
      const visibleWidth=290*face.unit(size,size);
      assert.ok(visibleWidth>=(compact?100:148)&&visibleWidth<=(compact?115:164));
      for(const tilt of [-.15,.19]){
        const unit=face.unit(size,size),outline=silhouette();
        const top=Math.min(...outline.map(point=>size*face.y+(point.y*Math.cos(tilt)+point.x*Math.sin(tilt)-10.5)*unit));
        assert.ok(top>size*.05,'the held head and breath remain inside the canvas');
      }
    }finally{f.presence.dispose();}
  }
});
