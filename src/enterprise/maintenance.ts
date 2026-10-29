// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Inspect first, then explicitly confirm exact dead-owner claims. Never kill a process.
// 先检查，再确认准确的失效声明；绝不终止进程或凭锁龄接管。
import {open,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {readDeployment,readPrivateJson,type OperationalDeployment} from './configuration.ts';
import {digest} from '../identity/service.ts';
import {readInstanceLock,readOperationLock,processExists,operationPath,recoveryClaimPath,optionalPrivateJson} from './operation-guard.ts';

const owner=z.object({pid:z.number().int().positive(),id:z.uuid(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const planSchema=z.object({format:z.literal(1),deploymentId:z.uuid(),instance:owner.nullable(),operation:owner.nullable()}).strict();
async function snapshot(config:OperationalDeployment){const instance=await readInstanceLock(config),operation=await readOperationLock(config);return planSchema.parse({format:1,deploymentId:config.deploymentId,instance:instance?{pid:instance.pid,id:instance.instanceId,sha256:digest(JSON.stringify(instance))}:null,operation:operation?{pid:operation.pid,id:operation.id,sha256:digest(JSON.stringify(operation))}:null});}
// The full actual object is retained for lock hashing. / 锁哈希仍使用实际完整对象。
export async function inspectEnterpriseLocks(configFile:string){return inspectDeploymentLocks(await readDeployment(configFile));}
export async function inspectDeploymentLocks(config:OperationalDeployment){const plan=await snapshot(config);return {plan,instanceOwnerAlive:plan.instance?processExists(plan.instance.pid):null,operationOwnerAlive:plan.operation?processExists(plan.operation.pid):null,recoveryClaimPresent:(await optionalPrivateJson(recoveryClaimPath(config)))!==null,automaticTakeover:false};}
async function assertPortFree(port:number){const server=createServer();try{await new Promise<void>((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok);});}catch{throw Error('enterprise_recovery_port_occupied');}finally{if(server.listening)await new Promise<void>((ok,fail)=>server.close(e=>e?fail(e):ok()));}}
export async function recoverEnterpriseLocks(configFile:string,inputFile:string){const expected=planSchema.parse(await readPrivateJson(inputFile)),config=await readDeployment(configFile);return recoverDeploymentLocks(config,expected);}
export async function recoverDeploymentLocks(config:OperationalDeployment,input:unknown){
 const expected=planSchema.parse(input);if(expected.deploymentId!==config.deploymentId)throw Error('enterprise_recovery_plan_mismatch');if(!expected.instance&&!expected.operation)throw Error('enterprise_recovery_no_locks');
 const file=recoveryClaimPath(config),claim={id:randomUUID(),pid:process.pid,deploymentId:config.deploymentId};let handle;try{handle=await open(file,'wx',0o600);}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw Error('enterprise_lock_recovery_busy');throw e;}
 try{
  await handle.writeFile(JSON.stringify(claim));await handle.sync();await handle.close();handle=undefined;
  const current=await snapshot(config);if(JSON.stringify(current)!==JSON.stringify(expected))throw Error('enterprise_recovery_plan_mismatch');
  for(const value of [current.instance,current.operation])if(value&&processExists(value.pid))throw Error('enterprise_recovery_owner_alive');
  await assertPortFree(config.port);if(JSON.stringify(await snapshot(config))!==JSON.stringify(current))throw Error('enterprise_recovery_plan_mismatch');
  // Both owners must remain absent. PID reuse intentionally blocks recovery.
  // 两个原进程均须不存在；PID复用也有意阻止恢复。
  for(const value of [current.instance,current.operation])if(value&&processExists(value.pid))throw Error('enterprise_recovery_owner_alive');
  if(current.instance)await unlink(join(config.stateDirectory,'instance.json'));if(current.operation)await unlink(operationPath(config));
  return {recovered:true,deploymentId:config.deploymentId,instanceLockRemoved:current.instance!==null,operationLockRemoved:current.operation!==null,started:false,processesTerminated:0};
 }finally{await handle?.close();const current=await optionalPrivateJson(file);if(current?.id!==claim.id)throw Error('enterprise_recovery_claim_changed');await unlink(file);}
}
