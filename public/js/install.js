let installPrompt;
const button=document.getElementById('install-nox'),note=document.getElementById('install-note');
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;if(button){button.hidden=false;button.disabled=false;}});
button?.addEventListener('click',async()=>{if(!installPrompt)return;const prompt=installPrompt;installPrompt=null;button.disabled=true;try{await prompt.prompt();const choice=await prompt.userChoice;if(note)note.textContent=choice.outcome==='accepted'?'Installation requested. Your browser will confirm when NOX is ready. Live AI and natural voice still need a connection.':'You can add NOX later using your browser’s Add to Home screen option.';}catch{if(note)note.textContent='Installation could not finish. Use your browser’s Add to Home screen option.';}finally{button.hidden=!installPrompt;button.disabled=false;}});
window.addEventListener('appinstalled',()=>{installPrompt=null;if(button)button.hidden=true;if(note)note.textContent='NOX is installed on this device. Live AI and natural voice still need a connection.';});
if('serviceWorker' in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname)))navigator.serviceWorker.register('/sw.js').catch(()=>{if(note)note.textContent='NOX works in this browser. Offline support is unavailable here.';});
function network(){document.body.dataset.offline=String(!navigator.onLine);let status=document.getElementById('network-status');if(!status){status=document.createElement('p');status.id='network-status';status.className='network-status';status.setAttribute('role','status');document.querySelector('.header')?.after(status);}status.hidden=navigator.onLine;status.textContent='You’re offline. This loaded conversation and local activities remain available; new AI replies need a connection.';}
window.addEventListener('online',network);window.addEventListener('offline',network);network();
let warming=false,pendingWarm=false;
async function warmShell(){
  if(!navigator.onLine||!navigator.serviceWorker)return;
  if(warming){pendingWarm=true;return;}warming=true;
  try{const registration=await navigator.serviceWorker.ready;registration.active?.postMessage({type:'cache-saved-shell',urls:performance.getEntriesByType('resource').map(entry=>entry.name)});}catch{}
  finally{warming=false;if(pendingWarm){pendingWarm=false;void warmShell();}}
}
window.addEventListener('nox:companion-change',warmShell);
// A late import can finish after the first state-change snapshot. Observe only
// public script/style completions; worker fetching never appears in this list.
if(typeof PerformanceObserver==='function')try{
  const resources=new PerformanceObserver(list=>{
    if(list.getEntries().some(entry=>{try{const url=new URL(entry.name);return url.origin===location.origin&&!url.search&&/\.(?:js|css)$/.test(url.pathname);}catch{return false;}}))void warmShell();
  });
  resources.observe({type:'resource',buffered:true});
}catch{/* State changes still warm the shell on older browsers. */}
