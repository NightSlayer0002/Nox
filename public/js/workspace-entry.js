// Apply the requested panel before modules await account/provider checks.
// This classic entry has no network or storage dependency and reads no data.
(()=>{
  const requested=location.hash.slice(1),routes=['conversation','explore','discover','scenes','afterimage','library','memory','access','learn','guessing'];
  const view=routes.includes(requested)?requested:'conversation';
  const panel=view==='guessing'?'learn':view==='explore'?'discover':view;
  document.body.dataset.view=view;
  document.querySelectorAll('[data-panel]').forEach(node=>{node.hidden=node.dataset.panel!==panel;});
})();
