// Stopped-instance changes retain both the local claim and actual database owner.
// 停服配置同时保持本机运维声明与实际单库归属。
import {join} from 'node:path';
import type {Database,Sql} from '../db/adapter.ts';
import {readSchemaInventory} from '../db/schema-health.ts';
import {inspectNativeRuntime} from '../db/native-runtime-preflight.ts';
import {connectNativeRuntime,acquireNativeRuntimeOwnership,isVerifiedNativeRuntimeConnection} from '../db/native-runtime-connection.ts';
import {digest} from '../identity/service.ts';
import {readNativeDeployment,type NativeDeployment} from './native-configuration.ts';
import {assertNoPendingNativeBackup} from './native-backup-journal.ts';
import {withDeploymentOperation,requireDeploymentOperation,readInstanceLock} from './operation-guard.ts';

export async function withStoppedNativeConfiguration<T>(root:string,configFile:string,config:NativeDeployment,purpose:'models'|'tools',run:(db:Database,guard:()=>Promise<void>)=>Promise<T>){
 return withDeploymentOperation(config,purpose,async()=>{
  const configurationSha256=digest(JSON.stringify(config));
  const local=async()=>{await requireDeploymentOperation(config,[purpose]);if(digest(JSON.stringify(await readNativeDeployment(configFile)))!==configurationSha256)throw Error('native_configuration_conflict');if(await readInstanceLock(config))throw Error('native_configuration_requires_stopped');await assertNoPendingNativeBackup(config);};
  await local();const expectedMigrations=await readSchemaInventory(join(root,'migrations')),connection=await connectNativeRuntime(config.runtimeDescriptorFile,expectedMigrations,config.runtimeDescriptorSha256),raw=connection.database;
  try{
   if(!isVerifiedNativeRuntimeConnection(raw,config.enterpriseId,config.runtimeRole,config.runtimeDescriptorSha256))throw Error('native_configuration_scope_mismatch');
   const owner=await acquireNativeRuntimeOwnership(raw,{ownershipAcknowledged:true});
   const guard=async()=>{if(!owner.isActive()||!isVerifiedNativeRuntimeConnection(raw,config.enterpriseId,config.runtimeRole,config.runtimeDescriptorSha256))throw Error('native_runtime_ownership_unavailable');await local();if(!owner.isActive())throw Error('native_runtime_ownership_unavailable');};
   await guard();if(!(await inspectNativeRuntime(raw,{enterpriseId:config.enterpriseId,runtimeRole:config.runtimeRole,expectedMigrations})).prerequisitesMet)throw Error('native_configuration_runtime_unqualified');
   // A lost owner/configuration aborts a metadata transaction before its COMMIT.
   // 归属或配置变化在元数据事务提交前终止事务。
   const guarded=(tx:Sql):Sql=>({query:async<R extends Record<string,unknown>>(s:string,p?:unknown[])=>{await guard();const result=await tx.query<R>(s,p);await guard();return result;},exec:async s=>{await guard();const result=await tx.exec(s);await guard();return result;}});
   const db:Database={profile:'postgres',...guarded(raw),transaction:fn=>raw.transaction(async tx=>{await guard();const result=await fn(guarded(tx));await guard();return result;}),close:async()=>{throw Error('native_configuration_close_forbidden');}};
   const result=await run(db,guard);await guard();return result;
  }finally{await raw.close();}
 });
}
