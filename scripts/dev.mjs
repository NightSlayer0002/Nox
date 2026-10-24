import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {watchClient} from './build-client.mjs';

// esbuild owns JSX/CSS dependencies; Node's watcher owns server/shared modules.
// One command closes both when the terminal ends. Browser refresh stays explicit.
const watcher=await watchClient();
const child=spawn(process.execPath,['--watch','server.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),stdio:'inherit'});
let closing=false;
async function close(code=0){
  if(closing)return;closing=true;
  if(process.platform==='win32'&&child.exitCode===null&&child.pid){
    // Node --watch owns a server subprocess. Terminate only this launched tree,
    // so closing dev cannot leave its listening server behind on Windows.
    await new Promise(resolve=>{const end=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});end.once('exit',resolve);end.once('error',resolve);});
  }else child.kill();
  await watcher.dispose();process.exitCode=code;
}
process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close());
child.once('error',error=>{console.error(error.message);void close(1);});
child.once('exit',code=>void close(code??0));
