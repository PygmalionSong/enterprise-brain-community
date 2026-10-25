// Cooperative local operations share one claim; age never implies permission to steal it.
// 本机运维共用互斥声明；不能凭锁龄自动接管。
import {open,lstat,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {readPrivateJson,type OperationalDeployment} from './configuration.ts';
import {digest} from '../identity/service.ts';

export const instanceLockSchema=z.object({pid:z.number().int().positive(),port:z.number().int().min(1024).max(65535),instanceId:z.uuid(),deploymentId:z.uuid(),configurationSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const operationLockSchema=z.object({format:z.literal(1),id:z.uuid(),pid:z.number().int().positive(),deploymentId:z.uuid(),configurationSha256:z.string().regex(/^[a-f0-9]{64}$/),purpose:z.enum(['start','stop','backup','traffic','tools','models']),createdAt:z.iso.datetime()}).strict();
export type InstanceLock=z.infer<typeof instanceLockSchema>;
export const processExists=(pid:number)=>{try{process.kill(pid,0);return true;}catch(e){return (e as NodeJS.ErrnoException).code!=='ESRCH';}};
export const operationPath=(config:OperationalDeployment)=>join(config.stateDirectory,'operation.json');
export const recoveryClaimPath=(config:OperationalDeployment)=>join(config.stateDirectory,'lock-recovery.json');
export async function optionalPrivateJson(file:string){try{return await readPrivateJson(file);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
export async function readInstanceLock(config:OperationalDeployment):Promise<InstanceLock|null>{const raw=await optionalPrivateJson(join(config.stateDirectory,'instance.json'));if(raw===null)return null;const lock=instanceLockSchema.parse(raw);if(lock.port!==config.port||lock.deploymentId!==config.deploymentId||lock.configurationSha256!==digest(JSON.stringify(config)))throw Error('enterprise_instance_mismatch');return lock;}
export async function readOperationLock(config:OperationalDeployment){const raw=await optionalPrivateJson(operationPath(config));if(raw===null)return null;const lock=operationLockSchema.parse(raw);if(lock.deploymentId!==config.deploymentId||lock.configurationSha256!==digest(JSON.stringify(config)))throw Error('enterprise_operation_mismatch');return lock;}
// Under-claim helpers reject calls made outside this process's cooperative operation claim.
// UnderClaim入口拒绝未持有本进程规范运维声明的调用。
export async function requireDeploymentOperation(config:OperationalDeployment,purposes:Array<z.infer<typeof operationLockSchema>['purpose']>){
 const claim=await readOperationLock(config);if(!claim||claim.pid!==process.pid||!purposes.includes(claim.purpose))throw Error('enterprise_operation_claim_required');return claim;
}
async function noRecovery(config:OperationalDeployment){try{await lstat(recoveryClaimPath(config));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}throw Error('enterprise_lock_recovery_busy');}
export async function withDeploymentOperation<T>(config:OperationalDeployment,purpose:z.infer<typeof operationLockSchema>['purpose'],run:()=>Promise<T>):Promise<T>{
 await noRecovery(config);const file=operationPath(config),claim=operationLockSchema.parse({format:1,id:randomUUID(),pid:process.pid,deploymentId:config.deploymentId,configurationSha256:digest(JSON.stringify(config)),purpose,createdAt:new Date().toISOString()});
 let handle;try{handle=await open(file,'wx',0o600);}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw Error('enterprise_operation_busy');throw e;}
 try{await handle.writeFile(JSON.stringify(claim));await handle.sync();await handle.close();handle=undefined;await noRecovery(config);return await run();}
 finally{await handle?.close();const current=await readOperationLock(config);if(current?.id!==claim.id)throw Error('enterprise_operation_changed');await unlink(file);}
}
