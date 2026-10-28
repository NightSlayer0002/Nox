import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const launcher=fileURLToPath(new URL('../start-nox.cmd',import.meta.url));

function runLauncher(env,cwd){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/c','call "%NOX_TEST_LAUNCHER%"'],{cwd,env,windowsHide:true,windowsVerbatimArguments:true});
    let stdout='',stderr='';
    const timer=setTimeout(()=>{child.kill();reject(Error('The Windows launcher did not finish after redirected pause input.'));},10000);
    child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
    child.stdin.on('error',()=>{});child.stdin.end('\r\n');
  });
}

for(const exitCode of [0,23])test(`Windows launcher delegates to canonical npm start and preserves exit ${exitCode} through pause`,{skip:process.platform!=='win32'?'Windows launcher requires cmd.exe':false},async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'nox-launcher-'));
  try{
    const project=path.join(root,'project with spaces'),commands=path.join(root,'commands'),log=path.join(root,'commands.txt');
    await mkdir(project);await mkdir(commands);await copyFile(launcher,path.join(project,'start-nox.cmd'));
    await writeFile(path.join(commands,'npm.cmd'),'@echo off\r\n> "%NOX_TEST_LOG%" echo npm %*\r\n>> "%NOX_TEST_LOG%" cd\r\necho Synthetic npm start output.\r\nexit /b %NOX_TEST_EXIT%\r\n');
    await writeFile(path.join(commands,'node.cmd'),'@echo off\r\n> "%NOX_TEST_LOG%" echo direct node %*\r\nexit /b 97\r\n');
    const env={...process.env};for(const key of Object.keys(env))if(key.toLowerCase()==='path')delete env[key];
    Object.assign(env,{PATH:commands,PATHEXT:'.COM;.EXE;.BAT;.CMD',NOX_TEST_LAUNCHER:path.join(project,'start-nox.cmd'),NOX_TEST_LOG:log,NOX_TEST_EXIT:String(exitCode)});
    const result=await runLauncher(env,root);
    assert.equal(result.code,exitCode,result.stderr);
    assert.deepEqual((await readFile(log,'utf8')).trim().split(/\r?\n/),['npm start',project]);
    assert.match(result.stdout,/Synthetic npm start output/);
    if(exitCode)assert.match(result.stdout,/NOX could not start.*error above/);
    assert.match(result.stdout,/Press any key/i,'double-click users must retain the command output until the pause');
  }finally{
    assert.equal(path.dirname(path.resolve(root)),path.resolve(tmpdir()));assert.ok(path.basename(root).startsWith('nox-launcher-'));
    await rm(root,{recursive:true,force:true});
  }
});
