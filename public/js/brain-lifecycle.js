// A restored context is rebuilt by Orb so stale GPU objects never resume.
export function createBrainLifecycle({canvas,draw,disposeResources}){
  let disposed=false,lost=false;
  const lose=event=>{event.preventDefault();lost=true;};
  const restore=()=>{if(!disposed)api.onRestore?.();};
  canvas.addEventListener('webglcontextlost',lose);
  canvas.addEventListener('webglcontextrestored',restore);
  const api={canvas,kind:'anatomical-brain',onRestore:null,
    render(signal,focus){return !disposed&&!lost&&draw(signal,focus);},
    dispose(){if(disposed)return;disposed=true;api.onRestore=null;canvas.removeEventListener('webglcontextlost',lose);canvas.removeEventListener('webglcontextrestored',restore);disposeResources();}
  };
  return api;
}
