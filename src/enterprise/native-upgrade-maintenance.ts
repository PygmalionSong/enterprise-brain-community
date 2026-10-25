// Keep a source admission barrier across controller exits; it is never a generic stale service lock.
// 源启动阻挡跨控制器退出保留，不作为普通失效服务锁清除。
import {readFile,lstat,realpath,mkdir,open,unlink} from 'node:fs/promises';import {join,dirname} from 'node:path';import {hostname} from 'node:os';import {createHash,randomUUID} from 'node:crypto';import {z} from 'zod';
import {readNativeUpgradeAbandonment} from './native-upgrade-abandonment-record.ts';
import {readNativeDeployment,type NativeDeployment} from './native-configuration.ts';import {readNativeUpgradeJournal} from './native-upgrade-journal.ts';import {readInstanceLock,operationPath,processExists} from './operation-guard.ts';
const sha=z.string().regex(/^[a-f0-9]{64}$/),hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const claimSchema=z.object({format:z.literal(1),id:z.uuid(),journalId:z.uuid(),predecessor:sha,predecessorDisposition:z.enum(['root','released','observed_dead']),host:z.string().min(1).max(255),pid:z.number().int().positive(),createdAt:z.iso.datetime()}).strict();
async function directory(file:string){const s=await lstat(file);if(!s.isDirectory()||s.isSymbolicLink()||(await realpath(file)).toLowerCase()!==file.toLowerCase())throw Error('native_upgrade_maintenance_indirect_path');}
async function bytes(file:string,max=16384){await directory(dirname(file));const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size<1||s.size>max)throw Error('native_upgrade_maintenance_file_invalid');const b=await readFile(file);if(b.length<1||b.length>max)throw Error('native_upgrade_maintenance_file_invalid');return b;}
async function optional(file:string){try{return await bytes(file);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
async function fresh(file:string,value:string){const h=await open(file,'wx',0o600);try{await h.writeFile(value);await h.sync();}finally{await h.close();}}
export async function nativeUpgradeMaintenanceOwnership(jobDirectory:string){
 const state=await readNativeUpgradeJournal(jobDirectory);if(!state.header.format.endsWith('/2'))throw Error('native_upgrade_maintenance_v2_required');const folder=join(jobDirectory,'controllers'),chain:{claimSha256:string;released:boolean}[]=[];let predecessor=hash(state.header.id),last:z.infer<typeof claimSchema>|null=null,lastReleased=false;
 const result=()=>({journalId:state.header.id,sha256:hash(JSON.stringify({journalId:state.header.id,chain})),predecessor,file:join(folder,predecessor+'.json'),depth:chain.length,ownerPid:last?.pid??null,live:!!last&&!lastReleased&&processExists(last.pid),predecessorDisposition:!last?'root' as const:lastReleased?'released' as const:'observed_dead' as const});
 try{await directory(folder);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return result();throw e;}
 for(let i=0;i<=64;i++){
  const raw=await optional(join(folder,predecessor+'.json'));if(!raw)return result();if(i===64)throw Error('native_upgrade_maintenance_owner_limit');const c=claimSchema.parse(JSON.parse(raw.toString('utf8'))),expectedDisposition=!last?'root':lastReleased?'released':'observed_dead';
  if(c.journalId!==state.header.id||c.host!==state.header.host||c.predecessor!==predecessor||c.predecessorDisposition!==expectedDisposition||JSON.stringify(c)!==raw.toString('utf8'))throw Error('native_upgrade_maintenance_chain_changed');
  const claimSha256=hash(raw),release=await optional(join(folder,'released-'+c.id+'.json'));if(release&&release.toString('utf8')!==JSON.stringify({format:1,claimSha256}))throw Error('native_upgrade_maintenance_release_changed');last=c;lastReleased=!!release;chain.push({claimSha256,released:lastReleased});predecessor=claimSha256;
 }
 throw Error('native_upgrade_maintenance_owner_limit');
}
export class NativeUpgradeMaintenanceOwner {
 private configFile:string;private config:NativeDeployment;private jobDirectory:string;private headSha256:string;private headerSha256:string;private claimFile:string;private claimText:string;private claimId:string;private anchorText:string;private closed=false;
 private constructor(file:string,config:NativeDeployment,job:string,head:string,headerSha:string,claimFile:string,claimText:string,id:string,anchor:string){this.configFile=file;this.config=config;this.jobDirectory=job;this.headSha256=head;this.headerSha256=headerSha;this.claimFile=claimFile;this.claimText=claimText;this.claimId=id;this.anchorText=anchor;}
 static async acquire(configFile:string,jobDirectory:string,expectedHeadSha256:string,expectedOwnershipSha256:string){
  return this.acquireInternal(configFile,jobDirectory,expectedHeadSha256,expectedOwnershipSha256);
 }
 static async acquireAbandonmentCompletion(configFile:string,jobDirectory:string,expectedHeadSha256:string,expectedOwnershipSha256:string,abandonmentSha256:string){
  const abandoned=await readNativeUpgradeAbandonment(jobDirectory,abandonmentSha256);if(abandoned.evidence.configurationFile!==configFile||abandoned.state.headSha256!==expectedHeadSha256)throw Error('native_upgrade_maintenance_abandonment_changed');return this.acquireInternal(configFile,jobDirectory,expectedHeadSha256,expectedOwnershipSha256,abandonmentSha256);
 }
 private static async acquireInternal(configFile:string,jobDirectory:string,expectedHeadSha256:string,expectedOwnershipSha256:string,abandonmentSha256?:string){
  sha.parse(expectedHeadSha256);sha.parse(expectedOwnershipSha256);const state=await readNativeUpgradeJournal(jobDirectory),config=await readNativeDeployment(configFile),raw=await bytes(configFile),ownership=await nativeUpgradeMaintenanceOwnership(jobDirectory);
  const abandoned=await optional(join(jobDirectory,'abandoned.json'));if(abandonmentSha256?(!abandoned||hash(abandoned)!==abandonmentSha256):abandoned!==null)throw Error('native_upgrade_maintenance_abandoned');
  if(state.headSha256!==expectedHeadSha256||ownership.sha256!==expectedOwnershipSha256)throw Error('native_upgrade_maintenance_plan_changed');if(ownership.live)throw Error('native_upgrade_maintenance_controller_alive');
  if(state.failed||['created','backed_up'].includes(state.stage)||state.header.binding.sourceDeploymentId!==config.deploymentId||state.header.binding.enterpriseId!==config.enterpriseId||state.header.binding.configurationSha256!==hash(raw))throw Error('native_upgrade_maintenance_source_binding_changed');
  if(await readInstanceLock(config))throw Error('native_upgrade_maintenance_source_instance_present');if(state.pending&&state.pending.actorPid!==process.pid&&processExists(state.pending.actorPid))throw Error('native_upgrade_maintenance_original_producer_alive');
  const anchor=JSON.stringify({format:'enterprise-brain.native-upgrade-source-admission/1',journalId:state.header.id,enterpriseId:config.enterpriseId,deploymentId:config.deploymentId,configurationSha256:hash(raw),configuration:configFile,jobDirectory}),existing=await optional(operationPath(config));if(existing&&existing.toString('utf8')!==anchor)throw Error('native_upgrade_maintenance_source_busy');
  if(abandonmentSha256&&!existing)throw Error('native_upgrade_maintenance_source_already_released');
  const folder=join(jobDirectory,'controllers');try{await mkdir(folder,{mode:0o700});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}await directory(folder);if(ownership.depth>=64)throw Error('native_upgrade_maintenance_owner_limit');
  const claim=claimSchema.parse({format:1,id:randomUUID(),journalId:state.header.id,predecessor:ownership.predecessor,predecessorDisposition:ownership.predecessorDisposition,host:hostname().toLowerCase(),pid:process.pid,createdAt:new Date().toISOString()}),text=JSON.stringify(claim);try{await fresh(ownership.file,text);}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw Error('native_upgrade_maintenance_controller_busy');throw e;}
  try{try{await fresh(operationPath(config),anchor);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;if((await bytes(operationPath(config))).toString('utf8')!==anchor)throw Error('native_upgrade_maintenance_source_busy');}
   const owner=new NativeUpgradeMaintenanceOwner(configFile,config,jobDirectory,state.headSha256,hash(JSON.stringify(state.header)),ownership.file,text,claim.id,anchor);await owner.guard();return owner;
  }catch(e){if((await bytes(ownership.file)).toString('utf8')!==text)throw Error('native_upgrade_maintenance_claim_changed');await fresh(join(folder,'released-'+claim.id+'.json'),JSON.stringify({format:1,claimSha256:hash(text)}));throw e;}
 }
 private async baseGuard(){if(this.closed||(await bytes(this.claimFile)).toString('utf8')!==this.claimText)throw Error('native_upgrade_maintenance_claim_changed');const state=await readNativeUpgradeJournal(this.jobDirectory),ownership=await nativeUpgradeMaintenanceOwnership(this.jobDirectory);if(hash(JSON.stringify(state.header))!==this.headerSha256||!ownership.live||ownership.ownerPid!==process.pid||ownership.predecessor!==hash(this.claimText))throw Error('native_upgrade_maintenance_owner_changed');const config=await readNativeDeployment(this.configFile);if(hash(await bytes(this.configFile))!==state.header.binding.configurationSha256||JSON.stringify(config)!==JSON.stringify(this.config)||await readInstanceLock(config)||(await bytes(operationPath(config))).toString('utf8')!==this.anchorText)throw Error('native_upgrade_maintenance_source_changed');return state;}
 async guard(){const state=await this.baseGuard();if(state.headSha256!==this.headSha256)throw Error('native_upgrade_maintenance_journal_changed');return state;}
 async adoptHead(expectedHeadSha256:string){sha.parse(expectedHeadSha256);const state=await this.baseGuard();if(state.headSha256!==expectedHeadSha256)throw Error('native_upgrade_maintenance_plan_changed');this.headSha256=expectedHeadSha256;return state;}
 async release(){if(this.closed)return;await this.guard();await fresh(join(this.jobDirectory,'controllers','released-'+this.claimId+'.json'),JSON.stringify({format:1,claimSha256:hash(this.claimText)}));this.closed=true;}
 // Caller closes its PG maintenance lease first; the live local claim excludes concurrent finishers.
 // 调用者先关闭自己的PG维护连接，活本机声明在清准确源阻挡时排除并发完成者。
 async releaseAbandonedSource(abandonmentSha256:string){
  await this.guard();const abandoned=await readNativeUpgradeAbandonment(this.jobDirectory,abandonmentSha256);if(abandoned.evidence.configurationFile!==this.configFile)throw Error('native_upgrade_maintenance_abandonment_changed');const file=join(this.jobDirectory,'source-release.json'),text=JSON.stringify(abandoned.release),old=await optional(file);if(old&&old.toString('utf8')!==text)throw Error('native_upgrade_maintenance_release_changed');if(!old)await fresh(file,text);await this.guard();if((await bytes(operationPath(this.config))).toString('utf8')!==this.anchorText)throw Error('native_upgrade_maintenance_source_changed');
  await unlink(operationPath(this.config));await fresh(join(this.jobDirectory,'controllers','released-'+this.claimId+'.json'),JSON.stringify({format:1,claimSha256:hash(this.claimText)}));this.closed=true;return {abandoned:true,sourceBarrierReleased:true,sourceStarted:false,modelCalls:0};
 }
}
