const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function floatingAllowed({view,presence,callOpen,film=false,recording=false}={}){
  return view==='conversation'&&presence!=='hidden'&&callOpen!=='true'&&!film&&!recording;
}

export function floatingLayout({viewport={},shell={},header={},composer={},nav={},compact=false,takeover=false}={}){
  const width=Math.max(1,finite(viewport.width,390)),height=Math.max(1,finite(viewport.height,844));
  const offsetLeft=finite(viewport.offsetLeft),offsetTop=finite(viewport.offsetTop),size=(compact?96:128)*(takeover?1.5:1);
  const left=Math.max(offsetLeft,finite(shell.left))+8;
  const right=Math.max(left+size,Math.min(offsetLeft+width,finite(shell.right,width))-8);
  const top=Math.min(offsetTop+height-size,Math.max(offsetTop+8,finite(header.bottom)+8));
  const bottom=Math.max(top+size,offsetTop+height-finite(nav.height)-8);
  // Face artwork has a small transparent lower margin inside its canvas.
  const floor=clamp(finite(composer.top,bottom)+size*.065,top+size,bottom);
  const parkX=clamp(finite(composer.right,right)-size,left,right-size);
  return {size,bounds:{left,top,right,bottom,floor},park:{x:parkX,y:floor-size}};
}

// Android's interactive-widget mode resizes innerHeight too; retain a baseline
// instead of only comparing visualViewport.height to the already-shrunken page.
export function createKeyboardTracker(){
  let baseline=0,previousWidth=0,open=false;
  return {update({width,height,layoutHeight=height,focused=false,scale=1}={}){
    if(scale!==1||!Number.isFinite(height)||height<120)return {open,changed:false};
    if(Math.abs(finite(width)-previousWidth)>80){baseline=Math.max(height,finite(layoutHeight,height));previousWidth=finite(width);}
    baseline=Math.max(baseline,height,finite(layoutHeight,height));
    const next=Boolean(focused&&baseline-height>Math.max(130,baseline*.22));
    const changed=next!==open;open=next;return {open,changed};
  }};
}
