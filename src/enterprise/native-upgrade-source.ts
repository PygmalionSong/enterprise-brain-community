// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
import{canonicalPathEqual}from'../platform/canonical-path.ts';
// Post-backup source maintenance is a new exclusion lease, never evidence of an original-owner backup.
// 备份后的源维护是新的互斥归属，绝不冒充原运行归属的备份证据。
import {readFile,lstat,realpath} from 'node:fs/promises';import {dirname,resolve,isAbsolute} from 'node:path';import {createHash} from 'node:crypto';import {z} from 'zod';
import type {Database} from '../db/adapter.ts';import {connectNativeRuntime,acquireNativeRuntimeOwnership,isVerifiedNativeRuntimeConnection,nativeRuntimeOwnershipIdentity,nativeRuntimeDescriptorSchema} from '../db/native-runtime-connection.ts';import {inspectNativeRuntime} from '../db/native-runtime-preflight.ts';
import {readNativeDeployment,type NativeDeployment} from './native-configuration.ts';import {NativeUpgradeMaintenanceOwner} from './native-upgrade-maintenance.ts';import {nativeUpgradeSqlIdentity,type NativeUpgradeSignedSql} from './native-upgrade-sql.ts';
import type {VerifiedNativeArchive} from './native-archive.ts';import {recheckNativeRestoreArchive} from './native-restore-archive.ts';import {nativeBackupInputSchema} from './native-backup-task.ts';import {openNativeBackupSnapshot,nativeBackupSnapshotInventory,nativeBackupSnapshotSource} from './native-backup-snapshot.ts';
const absolute=z.string().max(1024).refine(v=>isAbsolute(v)&&resolve(v)===v),sha=z.string().regex(/^[a-f0-9]{64}$/),hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
async function bytes(file:string,max:number){absolute.parse(file);const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size<1||s.size>max||!canonicalPathEqual((await realpath(dirname(file))),dirname(file)))throw Error('native_upgrade_source_private_file_invalid');const b=await readFile(file);if(b.length<1||b.length>max)throw Error('native_upgrade_source_file_limit');return b;}
const json=(b:Buffer)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
export async function openNativeUpgradeSourceMaintenance(owner:NativeUpgradeMaintenanceOwner,archive:VerifiedNativeArchive,sql:NativeUpgradeSignedSql,configFile:string,backupInputFile:string,expectedBackupInputSha256:string){
 sha.parse(expectedBackupInputSha256);const state=await owner.guard(),signed=await nativeUpgradeSqlIdentity(sql),source=await recheckNativeRestoreArchive(archive),config=await readNativeDeployment(configFile);
 if(source.root!==signed.currentRoot||source.enterpriseId!==config.enterpriseId||state.header.binding.sourceDeploymentId!==config.deploymentId||state.header.binding.currentManifestSha256!==signed.binding.currentManifestSha256||state.header.binding.candidateManifestSha256!==signed.binding.candidateManifestSha256||state.header.binding.publisherFingerprint!==signed.binding.publisherFingerprint||state.header.binding.configurationSha256!==signed.binding.configurationSha256||state.header.binding.configurationSha256!==hash(await bytes(configFile,16384)))throw Error('native_upgrade_source_binding_changed');
 const input=await bytes(backupInputFile,16384);if(hash(input)!==expectedBackupInputSha256)throw Error('native_upgrade_source_backup_input_changed');const request=nativeBackupInputSchema.parse(json(input));
 const rBytes=await bytes(config.runtimeDescriptorFile,16384),bBytes=await bytes(request.backupDescriptorFile,16384);if(hash(rBytes)!==config.runtimeDescriptorSha256||hash(bBytes)!==request.backupDescriptorSha256)throw Error('native_upgrade_source_descriptor_changed');
 const runtime=nativeRuntimeDescriptorSchema.parse(json(rBytes)),backup=z.object({passwordFile:absolute,tls:z.object({mode:z.literal('verify-full'),caFile:absolute}).strict()}).passthrough().parse(json(bBytes));if(runtime.tls.mode!=='verify-full')throw Error('native_upgrade_source_tls_required');
 const pinSpecs=[{file:backupInputFile,max:16384},{file:config.runtimeDescriptorFile,max:16384},{file:request.backupDescriptorFile,max:16384},{file:runtime.passwordFile,max:512},{file:runtime.tls.caFile,max:65536},{file:backup.passwordFile,max:512},{file:backup.tls.caFile,max:65536}],pins=await Promise.all(pinSpecs.map(async p=>({...p,sha256:hash(await bytes(p.file,p.max))})));
 const stableFiles=async()=>{for(const p of pins)if(hash(await bytes(p.file,p.max))!==p.sha256)throw Error('native_upgrade_source_credentials_changed');};
 const connection=await connectNativeRuntime(config.runtimeDescriptorFile,source.migrations,config.runtimeDescriptorSha256),database=connection.database;let closed=false,closing:Promise<void>|undefined;
 const close=()=>closing??=(async()=>{closed=true;await database.close();})();
 try{
  if(!isVerifiedNativeRuntimeConnection(database,config.enterpriseId,config.runtimeRole,config.runtimeDescriptorSha256))throw Error('native_upgrade_source_runtime_unqualified');const lease=await acquireNativeRuntimeOwnership(database,{ownershipAcknowledged:true});
  const assertOwner=async()=>{
   if(closed||!lease.isActive())throw Error('native_upgrade_source_ownership_unavailable');await owner.guard();await stableFiles();const id=nativeRuntimeOwnershipIdentity(database,config.enterpriseId,config.runtimeRole,config.runtimeDescriptorSha256).runtimeId;
   const actual=(await database.query("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_stat_activity a ON a.pid=l.pid WHERE l.locktype='advisory' AND l.database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()) AND l.classid=71245120 AND l.objid=1 AND l.objsubid=2 AND l.granted AND a.application_name=$1) owned",['eb-owner:'+id])).rows[0]?.owned;if(actual!==true||!lease.isActive())throw Error('native_upgrade_source_ownership_unavailable');await owner.guard();
  };
  const check=async()=>{
   await assertOwner();await nativeUpgradeSqlIdentity(sql);await recheckNativeRestoreArchive(archive);if(!(await inspectNativeRuntime(database,{enterpriseId:config.enterpriseId,runtimeRole:config.runtimeRole,expectedMigrations:source.migrations})).prerequisitesMet)throw Error('native_upgrade_source_runtime_unqualified');
   const snapshot=await openNativeBackupSnapshot(database,source.root,configFile,request.backupDescriptorFile,request.backupDescriptorSha256,{backupReadAcknowledged:true,maxMs:request.timeoutMs});
   try{const scope=nativeBackupSnapshotSource(snapshot);if(scope.sourceDatabaseSha256!==source.database.sourceDatabaseSha256||scope.runtimeRoleSha256!==source.database.runtimeRoleSha256||JSON.stringify(await nativeBackupSnapshotInventory(snapshot))!==JSON.stringify(source.inventory))throw Error('native_upgrade_source_point_changed');await assertOwner();return {sourcePointUnchanged:true,originalBackupId:archive.id,backupCreated:false,postBackupMaintenanceOwnership:true,serviceStarted:false,modelCalls:0};}finally{await snapshot.close();}
  };
  await check();return Object.freeze({check,assertOwner,close});
 }catch(e){await close().catch(()=>{});throw e;}
}
