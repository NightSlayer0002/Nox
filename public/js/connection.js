// Cloud access and an explicitly chosen demo are different product states.
export function connectionState(status={},selected=''){
  if(selected==='demo')return {kind:'demo'};
  if(status.access==='locked')return {kind:'locked'};
  if(!status.access)return {kind:'loading'};
  const provider=status.providers?.find(p=>p.id===(selected||status.provider));
  return status.brain==='live'&&provider?{kind:'live',provider}:{kind:'unconfigured'};
}
