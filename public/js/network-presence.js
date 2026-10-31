// Browser connectivity is a hint, not proof that a provider is reachable.
export function attachNetworkPresence({stage,host=stage.canvas.parentElement,windowTarget=globalThis.window,navigatorTarget=globalThis.navigator,documentTarget=globalThis.document}){
  if(!host||!documentTarget?.createElement||!windowTarget)return()=>{};
  const status=documentTarget.createElement('span');status.className='nox-network-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');host?.append(status);
  const events=new AbortController();let previous;
  const update=()=>{
    const offline=navigatorTarget.onLine===false;
    documentTarget.body.dataset.network=offline?'offline':'online';status.hidden=!offline;
    status.textContent=offline?'Offline · still here':'';
    status.title='Reconnect to send messages. Your open conversation is still here.';
    if(previous!==undefined&&offline!==previous)stage.character.react?.(offline?'confused':'content',stage.time,1.4);
    previous=offline;
  };
  windowTarget.addEventListener('online',update,{signal:events.signal});windowTarget.addEventListener('offline',update,{signal:events.signal});update();
  return()=>{events.abort();status.remove();};
}
