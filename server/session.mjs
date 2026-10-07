import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const lifetime=12*60*60*1000;
const signature=(value,secret,host)=>createHmac('sha256',secret).update(`nox-session-v1\0${host}\0${value}`).digest('base64url');
export function mintSession(secret,host,now=Date.now()){
  const payload=`${now+lifetime}.${randomBytes(16).toString('base64url')}`;
  return `${payload}.${signature(payload,secret,host)}`;
}
export function validSession(value,secret,host,now=Date.now()){
  if(!secret||typeof value!=='string'||value.length>150)return false;
  const parts=value.split('.');if(parts.length!==3||!/^\d{1,16}$/.test(parts[0])||! /^[\w-]{22}$/.test(parts[1]))return false;
  const expires=Number(parts[0]);if(expires<=now||expires>now+lifetime)return false;
  const supplied=Buffer.from(parts[2]),expected=Buffer.from(signature(`${parts[0]}.${parts[1]}`,secret,host));
  return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
}
export function sessionFromCookie(header,hosted){
  if(typeof header!=='string'||header.length>8192)return '';
  const name=hosted?'__Host-nox_session':'nox_session';
  const matches=header.split(';').map(v=>v.trim()).filter(v=>v.startsWith(`${name}=`));
  return matches.length===1?matches[0].slice(name.length+1):'';
}
export function sessionCookie(value,hosted){
  return `${hosted?'__Host-nox_session':'nox_session'}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${value?lifetime/1000:0}${hosted?'; Secure':''}`;
}

// A bounded, process-local guard. Serverless instances do not share this map;
// the owner token and signed session remain the actual authorization boundary.
export function createUnlockThrottle({now=Date.now,maxFailures=8,windowMs=5*60*1000,maxEntries=512}={}){
  const failures=new Map();
  const retryAfter=ip=>{
    const time=now();
    for(const [key,value] of failures)if(value.expires<=time)failures.delete(key);
    const entry=failures.get(ip);
    return entry?.count>=maxFailures?Math.max(1,Math.ceil((entry.expires-time)/1000)):0;
  };
  return {
    retryAfter,
    fail(ip){
      retryAfter(ip);
      let entry=failures.get(ip);
      if(!entry){
        if(failures.size>=maxEntries)failures.delete(failures.keys().next().value);
        entry={count:0,expires:now()+windowMs};failures.set(ip,entry);
      }
      entry.count++;
    },
    clear:ip=>failures.delete(ip),
  };
}
