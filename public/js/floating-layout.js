const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function floatingAllowed({view,presence,callOpen,film=false,recording=false}={}){
  return view==='conversation'&&presence!=='hidden'&&callOpen!=='true'&&!film&&!recording;
}

export function floatingLayout({viewport={},shell={},header={},welcome={},composer={},nav={},compact=false,takeover=false}={}){
  const width=Math.max(1,finite(viewport.width,390)),height=Math.max(1,finite(viewport.height,844));
  const offsetLeft=finite(viewport.offsetLeft),offsetTop=finite(viewport.offsetTop),preferredSize=(compact?160:256)*(takeover?1.5:1);
  const left=clamp(Math.max(offsetLeft,finite(shell.left))+8,offsetLeft,offsetLeft+width-1);
  const right=clamp(Math.min(offsetLeft+width,finite(shell.right,offsetLeft+width))-8,left+1,offsetLeft+width);
  const bottom=clamp(offsetTop+height-Math.max(0,finite(nav.height))-8,offsetTop+1,offsetTop+height);
  const top=clamp(Math.max(offsetTop+8,finite(header.bottom)+8),offsetTop,bottom-1);
  // Short landscapes and Takeover shrink the artwork, never its usable bounds.
  const size=Math.min(preferredSize,right-left,bottom-top);
  // Face artwork has a small transparent lower margin inside its canvas.
  const floor=clamp(finite(composer.top,bottom)+size*.12,top+size,bottom);
  const parkX=clamp(finite(composer.right,right)-size,left,right-size);
  const visibleWelcome=finite(welcome.height)>0?welcome:{};
  const initialX=clamp(finite(visibleWelcome.right,right)-size,left,right-size);
  const initialY=compact?top:clamp(finite(visibleWelcome.top,top)+finite(visibleWelcome.height,height*.65)*.5-size*.5,top,Math.max(top,floor-size));
  return {size,bounds:{left,top,right,bottom,floor},initial:{x:initialX,y:initialY},park:{x:parkX,y:floor-size}};
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
