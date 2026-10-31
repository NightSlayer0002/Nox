// One still from the production anatomical renderer, never a second animation
// loop. Dispose its GPU resources immediately after copying the frame.
export function attachPresencePreview(menu,image){
  if(!menu||!image)return()=>{};
  const controller=new AbortController();let pending=false,complete=false;
  const preview=async()=>{
    if(!menu.open||pending||complete)return;
    pending=true;let renderer;
    try{
      const {createBrainCharacter}=await import('/dist/brain-character.js');
      if(controller.signal.aborted)return;
      renderer=await createBrainCharacter({signal:controller.signal});
      if(controller.signal.aborted)return;
      if(renderer.render({clock:0,energy:.5,drive:.5,motion:0,color:[.5,.9,.85],status:'idle'},{})){
        image.src=renderer.canvas.toDataURL('image/png');image.dataset.preview='anatomical';complete=true;
      }
    }catch{/* Keep the sourced anatomical still when WebGL is unavailable. */}
    finally{renderer?.dispose();pending=false;}
  };
  menu.addEventListener('toggle',preview,{signal:controller.signal});
  return()=>controller.abort();
}
