// Bounded read-only preflight; no downloads or data writes.
// 有界只读预检，不下载、不写业务数据、不冒认其他安装。
import {access,statfs,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {localFetch,readLocalJSON} from './local-http.mjs';
const defaultRoot=resolve(fileURLToPath(new URL('..',import.meta.url)));
export async function probePort(port){
 if(!Number.isInteger(port)||port<1024||port>65535)return false;
 return new Promise(ok=>{const server=net.createServer();server.once('error',()=>ok(false));server.listen(port,'127.0.0.1',()=>server.close(()=>ok(true)));});
}
export async function ownsReadyPort(root,port,timeoutMs=2000){
 // Lock PID and per-start public identity match; no control key is transmitted.
 // 核对实例锁PID和本次启动公开标识，不发送控制密钥。
 try{
  const lock=JSON.parse(await readFile(resolve(root,'.runtime/instance.lock'),'utf8'));
  if(lock.port!==port||!Number.isInteger(lock.pid)||lock.pid<1||typeof lock.instanceId!=='string'||!/^[a-f0-9-]{36}$/.test(lock.instanceId))return false;
  try{process.kill(lock.pid,0);}catch{return false;}
  const response=await localFetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(timeoutMs),redirect:'error'});
  if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))return false;
  const health=await readLocalJSON(response,16384);
  return health.application==='enterprise-brain'&&health.status==='ready'&&health.instanceId===lock.instanceId;
 }catch{return false;}
}
export async function preflight({root=defaultRoot,env=process.env,nodeVersion=process.versions.node,healthTimeoutMs=2000,availableBytes}={}){
 const checks=[],port=Number(env.PORT??4318);let manifest;
 checks.push({id:'node24',pass:Number(nodeVersion.split('.')[0])===24,detail:nodeVersion});
 checks.push({id:'demo-mode',pass:(env.EB_MODE??'demo')==='demo'&&!env.DATABASE_URL,detail:'Local embedded database only / 仅本机嵌入式数据库'});
 try{manifest=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));}catch{}
 const manifestValid=manifest!==null&&typeof manifest==='object'&&!Array.isArray(manifest)&&typeof manifest.version==='string'&&/^\d+\.\d+\.\d+$/.test(manifest.version)&&manifest.dependencies!==null&&typeof manifest.dependencies==='object'&&!Array.isArray(manifest.dependencies);
 checks.push({id:'package-manifest',pass:manifestValid});
 if(!manifestValid)manifest=undefined;
 const dependencies={...manifest?.dependencies,...(manifest?.devDependencies?.esbuild?{esbuild:manifest.devDependencies.esbuild}:{})};
 for(const [name,version]of Object.entries(dependencies)){
  let installed;try{installed=JSON.parse(await readFile(resolve(root,'node_modules',name,'package.json'),'utf8'));}catch{}
  checks.push({id:'dependency:'+name,pass:installed?.name===name&&installed?.version===version});
 }
 try{await access(resolve(root,'data/operating-snapshot.json'));checks.push({id:'operating-snapshot',pass:true});}catch{checks.push({id:'operating-snapshot',pass:false});}
 try{await access(root,constants.W_OK);checks.push({id:'directory-write-permission',pass:true});}catch{checks.push({id:'directory-write-permission',pass:false});}
 try{const disk=availableBytes===undefined?await statfs(root):null,bytes=availableBytes??Number(disk.bavail)*Number(disk.bsize);checks.push({id:'disk-headroom',pass:Number.isFinite(bytes)&&bytes>512*1024*1024,detail:'Minimum512MiB / 至少512MiB'});}catch{checks.push({id:'disk-headroom',pass:false});}
 const validPort=Number.isInteger(port)&&port>=1024&&port<=65535;
 const free=validPort&&await probePort(port),ownReady=!free&&validPort&&await ownsReadyPort(root,port,healthTimeoutMs);
 checks.push({id:'port',pass:Boolean(free||ownReady),detail:validPort?{port,state:free?'free':ownReady?'own-ready':'occupied-or-unavailable'}:{state:'invalid'}});
 return {profile:'existing-Node24-local-development',platform:process.platform,architecture:process.arch,productVersion:manifest?.version??null,checks,pass:checks.every(c=>c.pass),cleanHostInstallationVerified:false,ubuntuVerified:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const result=await preflight();console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;}
