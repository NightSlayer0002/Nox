// Bounded protection for public free-tier calls. Each warm process has its own
// counters; this is not a distributed or persistent provider spending limit.
export function createPublicQuota({now=Date.now,windowMs=60000,perClient=4,total=12,maxClients=512}={}){
  let expires=0,count=0;const clients=new Map();
  const refresh=()=>{const time=now();if(time>=expires){expires=time+windowMs;count=0;clients.clear();}return time;};
  const status=client=>{refresh();return {scope:'process',limit:perClient,remaining:Math.max(0,Math.min(perClient-(clients.get(client)||0),total-count)),resetsAt:new Date(expires).toISOString()};};
  const reserve=client=>{
    const time=refresh();
    const used=clients.get(client)||0;
    if(count>=total||used>=perClient||!clients.has(client)&&clients.size>=maxClients)return {wait:Math.max(1,Math.ceil((expires-time)/1000))};
    count++;clients.set(client,used+1);const window=expires;let released=false;
    return {wait:0,releaseShared(){if(released)return;released=true;if(expires===window)count--;}};
  };
  // Failed daily checks still count against a client's abuse throttle, but can
  // release their reservation in the shared generation budget.
  return {status,reserve,take:client=>reserve(client).wait};
}
