// Keep the composer in the keyboard's visible viewport without reacting to pinch zoom.
export function attachWorkspaceViewport({viewport=globalThis.visualViewport,style,body,windowTarget=globalThis.window}={}){
  if(!viewport)return()=>{};
  style??=globalThis.document?.documentElement?.style;body??=globalThis.document?.body;
  if(!style||!body)return()=>{};
  const fit=()=>{
    const height=viewport.height;if(viewport.scale!==1||!Number.isFinite(height)||height<120)return;
    const full=Number.isFinite(windowTarget?.innerHeight)?windowTarget.innerHeight:height;
    style.setProperty('--workspace-height',`${Math.round(Math.min(height,full))}px`);
    body.dataset.keyboardOpen=height<full*.75?'true':'false';
  };
  viewport.addEventListener('resize',fit,{passive:true});windowTarget?.addEventListener('pageshow',fit);fit();
  return()=>{viewport.removeEventListener('resize',fit);windowTarget?.removeEventListener('pageshow',fit);style.removeProperty('--workspace-height');delete body.dataset.keyboardOpen;};
}
