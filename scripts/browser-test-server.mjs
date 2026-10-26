import {createAppServer} from '../server.mjs';
import {fixtureWav} from '../tests/helpers/wav.mjs';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';

// Browser CI never reads real credentials or spends provider quota.
function createSyntheticHandler(){
const attempts=new Map();
const server=createAppServer({hosted:false,apiKey:'',accessToken:'',speechKey:'',naturalVoice:false,
  providers:[{id:'groq',name:'Synthetic CI provider',model:'openai/gpt-oss-120b'}],
  guestAllowance:{status:async()=>null,take:async()=>({allowed:true})},
  async providerRequest({message},{signal,onText}){
    if(message==='CI wait for stop')await new Promise((resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
    const count=(attempts.get(message)||0)+1;attempts.set(message,count);
    if(message==='CI retry after failure'&&count===1)throw Object.assign(Error('Synthetic invalid packet'),{code:'invalid_json'});
    const speech=message==='CI long reading'?'A readable paragraph for the narrow conversation. '.repeat(38):message==='CI format prose'?'**A useful plan**\\n1. Read.\\n2. Practice.':`Synthetic answer to: ${message}`;
    onText?.(speech);return {speech,emotion:'curious',action:'none',memory:''};
  },
  speech:async()=>fixtureWav(Array(800).fill(0),8000),summary:async()=>'',
});
return server.listeners('request')[0];
}

export function createBrowserTestServer(){
const contexts=new Map(),fallback=createSyntheticHandler();
// Send real response headers before delaying the body: startup must keep its
// requested route visible during this otherwise easy-to-miss network boundary.
return http.createServer((request,response)=>{
  // Each Playwright context is one journey. Keep production admission behavior
  // within that journey without letting a faster suite exhaust another's quota.
  const context=request.headers.cookie?.match(/(?:^|;\s*)nox-ci-context=([^;]+)/)?.[1];
  let handler=contexts.get(context);
  if(!handler&&request.method==='GET'&&['/','/app','/guest'].includes(request.url.split('?')[0])){
    const id=randomUUID();handler=createSyntheticHandler();contexts.set(id,handler);
    response.setHeader('set-cookie',`nox-ci-context=${id}; Path=/; HttpOnly; SameSite=Strict`);
  }
  if(request.url==='/api/status'&&request.headers.cookie?.includes('nox-ci-delayed-status=1')){
    response.writeHead(200,{'content-type':'application/json'});response.flushHeaders();
    const timer=setTimeout(()=>response.end(JSON.stringify({owner:false,access:'guest',brain:'live',voice:'browser',guestProvider:{id:'groq',name:'Synthetic CI provider',model:'openai/gpt-oss-120b'},providers:[],usage:null})),600);
    response.on('close',()=>clearTimeout(timer));return;
  }
  (handler||fallback)(request,response);
});
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
const server=createBrowserTestServer(),port=Number(process.env.NOX_BROWSER_PORT||3017);
server.listen(port,'127.0.0.1',()=>console.log(`Synthetic NOX browser fixture: http://127.0.0.1:${server.address().port}`));
const close=()=>{server.closeAllConnections();server.close();};process.once('SIGTERM',close);process.once('SIGINT',close);
}
