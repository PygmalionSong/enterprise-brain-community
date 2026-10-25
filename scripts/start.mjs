// Development entry; preserves data across repeat starts. / 开发入口，重复启动保留数据。
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import {localFetch as fetch,readLocalJSON} from './local-http.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
if(Number(process.versions.node.split('.')[0])!==24)throw new Error('需要Node 24 / Node 24 is required');
if(!existsSync('node_modules/esbuild')){
 const bundled=resolve(dirname(process.execPath),'../node_modules/pnpm/bin/pnpm.mjs');
 if(!existsSync(bundled))throw new Error('缺少依赖，请执行pnpm install --frozen-lockfile / Missing dependencies: run pnpm install --frozen-lockfile');
 await run(process.execPath,[bundled,'install','--frozen-lockfile','--ignore-scripts','--store-dir','.cache/pnpm']);
}
await mkdir('.runtime',{recursive:true});
const lock=resolve('.runtime/instance.lock'),port=Number(process.env.PORT??4318);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('端口无效 / Invalid port');
if(existsSync(lock)){
 const prior=JSON.parse(await readFile(lock,'utf8'));let alive=false;try{process.kill(prior.pid,0);alive=true;}catch{}
 if(alive){
  const health=await fetch(`http://127.0.0.1:${prior.port}/health`,{signal:AbortSignal.timeout(2000),redirect:'error'}).then(r=>readLocalJSON(r,16384)).catch(()=>null);
  if(health?.application==='enterprise-brain'&&health.status==='ready'&&prior.instanceId&&health.instanceId===prior.instanceId&&prior.port===port){console.log(`服务已启动 / Already running: http://127.0.0.1:${port}`);process.exit(0);}
  throw new Error('实例正在启动或运行，请等待或关闭原实例 / Instance active; wait or stop the existing instance');
 }
 await unlink(lock);
}
await new Promise((ok,fail)=>{const probe=net.createServer();probe.once('error',fail);probe.listen(port,'127.0.0.1',()=>probe.close(ok));});
const instanceId=randomUUID();process.env.EB_INSTANCE_ID=instanceId;
const handle=await open(lock,'wx');await handle.writeFile(JSON.stringify({pid:process.pid,port,instanceId}));await handle.close();
const token=randomBytes(32).toString('base64url'),control=resolve('.runtime/control.json');
await (await import('node:fs/promises')).writeFile(control,JSON.stringify({port,token}),{mode:0o600});
process.env.EB_CONTROL_TOKEN=token;
try{await run(process.execPath,['scripts/build.mjs']);await run(process.execPath,['dist/server.js']);}finally{await unlink(lock).catch(()=>{});await unlink(control).catch(()=>{});}
function run(command,args){return new Promise((ok,fail)=>{const child=spawn(command,args,{stdio:'inherit',cwd:root,env:process.env});const stop=()=>child.kill('SIGTERM');process.once('SIGINT',stop);process.once('SIGTERM',stop);child.once('error',fail);child.once('exit',code=>{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);code===0?ok():fail(new Error(`进程退出 / Process exit ${code}`));});});}
