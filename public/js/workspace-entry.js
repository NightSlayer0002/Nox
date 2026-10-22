// Apply the requested panel before modules await account/provider checks.
// This classic entry has no network or storage dependency and reads no data.
(()=>{
  const routes=['conversation','explore','discover','scenes','afterimage','library','memory','access','learn','guessing'];
  function apply(){
    const requested=location.hash.slice(1),view=routes.includes(requested)?requested:'conversation';
    const panel=view==='guessing'?'learn':view==='explore'?'discover':view;
    document.body.dataset.view=view;
    document.querySelectorAll('[data-panel]').forEach(node=>{node.hidden=node.dataset.panel!==panel;});
  }
  apply();
  // This entry runs before visible markup. Interactive fires after parsing,
  // before deferred modules can wait on account checks or shader downloads.
  if(document.readyState==='loading')document.addEventListener('readystatechange',apply,{once:true});
  window.addEventListener('hashchange',apply);
})();
