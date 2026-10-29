import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {randomUUID} from 'node:crypto';import {mkdir,mkdtemp} from 'node:fs/promises';import {resolve,join} from 'node:path';import {execFile,spawn} from 'node:child_process';import {promisify} from 'node:util';
const exec=promisify(execFile);
test('independent processes recover completed or unknown original reads without another GET',async()=>{
 let hits=0,drop=false,hold=false,reached:()=>void=()=>{};const source=createServer((_req,res)=>{hits++;if(hold){reached();return;}if(drop){res.destroy();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({value:[{Id:'owned-process-row'}]}));});
 await mkdir('.evidence',{recursive:true});const root=await mkdtemp(resolve('.evidence/business-read-process-'));
 const invoke=async(mode:string,path:string,arg:string)=>{const result=await exec(process.execPath,['tests/fixtures/business-read-restart.mjs',mode,path,arg],{cwd:process.cwd(),timeout:30000,maxBuffer:100000});return result.stdout.trim()?JSON.parse(result.stdout.trim()):null;};
 try{await new Promise<void>(ok=>source.listen(0,'127.0.0.1',ok));const endpoint='http://127.0.0.1:'+(source.address() as any).port+'/Orders';
  for(const lost of [false,true]){drop=lost;const location=join(root,lost?'unknown':'completed');await mkdir(location);await invoke('prepare',location,endpoint);const ref=randomUUID(),initial=hits,first=await invoke('submit',location,ref);assert.equal(first.state,lost?'unknown':'completed');assert.equal(hits,initial+1);
   const recovered=await invoke('lookup',location,ref),retry=await invoke('submit',location,ref);assert.deepEqual(recovered,first);assert.deepEqual(retry,first);assert.equal(hits,initial+1);
  }
  hold=true;const location=join(root,'interrupted');await mkdir(location);await invoke('prepare',location,endpoint);const ref=randomUUID(),initial=hits;
  const arrived=new Promise<void>(ok=>{reached=ok;}),child=spawn(process.execPath,['tests/fixtures/business-read-restart.mjs','submit',location,ref],{cwd:process.cwd(),stdio:['ignore','ignore','pipe'],windowsHide:true});
  const exited=new Promise<void>((ok,fail)=>{child.once('error',fail);child.once('exit',()=>ok());});let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([arrived,new Promise<never>((_ok,fail)=>{timer=setTimeout(()=>fail(Error('owned_read_not_arrived')),10000);})]);assert.equal(hits,initial+1);child.kill();await exited;}finally{clearTimeout(timer);if(child.exitCode===null)child.kill();}
  const pending=await invoke('lookup',location,ref);assert.equal(pending.state,'unknown');assert.deepEqual(await invoke('submit',location,ref),pending);assert.equal(hits,initial+1);
 }finally{source.closeAllConnections();await new Promise<void>(ok=>source.close(()=>ok()));}
});
