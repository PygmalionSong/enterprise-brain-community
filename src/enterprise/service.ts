// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Foreground enterprise service and instance-checked local operations.
// 前台企业服务与核对实例身份的本机运维。
import {writeFile,open,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openDatabase,type Database} from '../db/adapter.ts';
import {migrate} from '../db/migrate.ts';
import {readSchemaInventory} from '../db/schema-health.ts';
import {createEnterpriseApplication} from '../http/enterprise.ts';
import {digest} from '../identity/service.ts';
import {readDeployment,readSecret,freshSecret} from './configuration.ts';
import {localFetch,readLocalJSON} from '../../scripts/local-http.mjs';
import {type InstanceLock as Lock,processExists as alive,readInstanceLock as readLock,withDeploymentOperation,requireDeploymentOperation} from './operation-guard.ts';
import {TrafficAdmission} from './traffic-policy.ts';
import {codeFingerprint} from './code-fingerprint.ts';
import {installedEnterpriseTools} from './installed-tools.ts';
import {GraphSupervisionPump} from '../runtime/graph-supervision.ts';
import {loadInstalledPlanningModel,planningModelSummary} from './installed-model.ts';

async function healthy(lock:Lock,requireReady=true){
 const response=await localFetch('http://127.0.0.1:'+lock.port+'/health',{signal:AbortSignal.timeout(2000)});if(![200,503].includes(response.status)){await response.body?.cancel();throw Error('enterprise_instance_mismatch');}
 // Only the identity-bearing health503 is decoded; other error responses remain denied.
 // 仅解析携带实例身份的健康503，其他错误响应仍拒绝。
 const h=await readLocalJSON(response.status===503?new Response(response.body,{status:200,headers:response.headers}):response,16384);
 if(h.application!=='enterprise-brain'||h.mode!=='enterprise'||h.status!==(response.status===200?'ready':'unavailable')||h.instanceId!==lock.instanceId)throw Error('enterprise_instance_mismatch');if(requireReady&&h.status!=='ready')throw Error('enterprise_not_ready');return h;
}
export {healthy as readEnterpriseHealth};
export async function enterpriseStatus(configFile:string){const config=await readDeployment(configFile),lock=await readLock(config);if(!lock)return {status:'not_running',deploymentId:config.deploymentId};if(!alive(lock.pid))throw Error('enterprise_stale_lock');const health=await healthy(lock,false);return {status:health.status,deploymentId:config.deploymentId,instanceId:lock.instanceId,port:lock.port,schema:health.schema,expectedSchema:health.expectedSchema,schemaState:health.schemaState,traffic:health.traffic,mode:'enterprise'};}
// Called directly only while a deployment operation claim is already held.
// 仅在已持有部署运维互斥声明时直接调用。
export async function stopEnterpriseUnderClaim(configFile:string){
 const config=await readDeployment(configFile),lock=await readLock(config);if(!lock)return {stopped:true,requested:false};if(!alive(lock.pid))throw Error('enterprise_stale_lock');await healthy(lock,false);
 if(JSON.stringify(await readLock(config))!==JSON.stringify(lock))throw Error('enterprise_instance_changed');const control=await readSecret(config.controlTokenFile),response=await localFetch('http://127.0.0.1:'+lock.port+'/ops/stop',{method:'POST',headers:{'X-Local-Control':control},signal:AbortSignal.timeout(2000)}),result=await readLocalJSON(response,16384);if(result.instanceId!==lock.instanceId||result.status!=='stopping')throw Error('enterprise_shutdown_denied');
 const end=Date.now()+10000;while(Date.now()<end){const remaining=await readLock(config);if(!remaining)return {stopped:true,requested:true,instanceId:lock.instanceId};if(remaining.instanceId!==lock.instanceId)throw Error('enterprise_instance_changed');await new Promise(ok=>setTimeout(ok,50));}throw Error('enterprise_shutdown_timeout');
}
export async function stopEnterprise(configFile:string){const config=await readDeployment(configFile);return withDeploymentOperation(config,'stop',()=>stopEnterpriseUnderClaim(configFile));}
export async function startEnterprise(root:string,configFile:string){const config=await readDeployment(configFile);return withDeploymentOperation(config,'start',()=>startEnterpriseUnderClaim(root,configFile));}
export async function startEnterpriseUnderClaim(root:string,configFile:string){
 const config=await readDeployment(configFile);await requireDeploymentOperation(config,['start','backup']);const prior=await readLock(config);if(prior){if(!alive(prior.pid))throw Error('enterprise_stale_lock');await healthy(prior);return {alreadyRunning:true,status:await enterpriseStatus(configFile)} as const;}
 await readSchemaInventory(join(root,'migrations'));await readSecret(config.controlTokenFile);const proxyToken=await readSecret(config.proxyTokenFile),traffic=await TrafficAdmission.open(config);
 const instanceId=randomUUID(),lock:Lock={pid:process.pid,port:config.port,instanceId,deploymentId:config.deploymentId,configurationSha256:digest(JSON.stringify(config))},lockFile=join(config.stateDirectory,'instance.json');const handle=await open(lockFile,'wx',0o600);await handle.writeFile(JSON.stringify(lock));await handle.sync();await handle.close();
 let db:Database|undefined,application:Awaited<ReturnType<typeof createEnterpriseApplication>>|undefined,closing:Promise<void>|undefined,pump:GraphSupervisionPump|undefined;
 const close=()=>closing??=(async()=>{pump?.stop();traffic.shutdown();await application?.closeWorkers();if(!await traffic.waitForIdle(5000))throw Error('enterprise_traffic_drain_timeout');if(application?.server.listening)await new Promise<void>(ok=>application!.server.close(()=>ok()));await db?.close();const current=await readLock(config);if(current?.instanceId!==instanceId)throw Error('enterprise_instance_changed');await unlink(lockFile);})().catch(e=>{closing=undefined;throw e;});
 try{
  const controlToken=freshSecret();await writeFile(config.controlTokenFile,controlToken,{mode:0o600});db=await openDatabase(join(config.stateDirectory,'database'));await migrate(db,join(root,'migrations'));
  const installedModel=await loadInstalledPlanningModel(db,root,config.enterpriseId),model={...installedModel,status:async()=>({...await planningModelSummary(db!,config.enterpriseId),state:(await loadInstalledPlanningModel(db!,root,config.enterpriseId)).state})};
  application=await createEnterpriseApplication(db,root,{enterpriseId:config.enterpriseId,instanceId,origin:config.origin,proxyToken,controlToken},{traffic,model,tools:await installedEnterpriseTools(db,config.toolInstallationFile),supervisionRuntimeSha256:await codeFingerprint(root),stop:()=>{void close().catch(()=>{process.exitCode=1;});}});
  await new Promise<void>((ok,fail)=>{application!.server.once('error',fail);application!.server.listen(config.port,'127.0.0.1',ok);});
  if(application.supervisor){pump=new GraphSupervisionPump(application.supervisor,config.enterpriseId,traffic,application.ready);pump.start();}
  return {alreadyRunning:false,status:await enterpriseStatus(configFile),close,server:application.server} as const;
 }catch(e){await close().catch(()=>{});throw e;}
}

