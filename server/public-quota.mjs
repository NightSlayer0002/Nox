// Bounded protection for public free-tier calls. Each warm process has its own
// counters; this is not a distributed or persistent provider spending limit.
export function createPublicQuota({now=Date.now,windowMs=60000,perClient=4,total=12,maxClients=512}={}){
  let expires=0,count=0;const clients=new Map();
  const refresh=()=>{const time=now();if(time>=expires){expires=time+windowMs;count=0;clients.clear();}return time;};
  const status=client=>{refresh();return {scope:'process',limit:perClient,remaining:Math.max(0,Math.min(perClient-(clients.get(client)||0),total-count)),resetsAt:new Date(expires).toISOString()};};
  return {status,take(client){
    const time=refresh();
    const used=clients.get(client)||0;
    if(count>=total||used>=perClient||!clients.has(client)&&clients.size>=maxClients)return Math.max(1,Math.ceil((expires-time)/1000));
    count++;clients.set(client,used+1);return 0;
  }};
}
