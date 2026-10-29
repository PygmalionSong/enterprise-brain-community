// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
import{canonicalPathEqual}from'../platform/canonical-path.ts';
// Exact offline database bytes bind a prepared cutover point; expose only aggregate hashes.
// 用离线数据库精确字节绑定准备点，仅返回汇总哈希，不暴露文件内容。
import {lstat,realpath,readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {readDeployment} from './configuration.ts';
import {readInstanceLock,requireDeploymentOperation} from './operation-guard.ts';
import {safeEnterprisePath} from './recovery.ts';
import {hash} from '../runtime/contracts.ts';
import {createHash} from 'node:crypto';
export async function captureUpgradeDatabase(configFile:string){
 const config=await readDeployment(configFile);await requireDeploymentOperation(config,['backup']);
 if(await readInstanceLock(config))throw Error('upgrade_inventory_requires_stopped');
 const directory=join(config.stateDirectory,'database'),stat=await lstat(directory);
 if(!stat.isDirectory()||stat.isSymbolicLink()||!canonicalPathEqual((await realpath(directory)),directory))throw Error('upgrade_inventory_indirect');
 const files:{path:string;bytes:number;sha256:string}[]=[],directories:string[]=[],seen=new Set<string>();let total=0;
 async function walk(dir:string,prefix:string){
  for(const item of await readdir(dir,{withFileTypes:true})){
   const rel=prefix?prefix+'/'+item.name:item.name,file=join(dir,item.name);safeEnterprisePath(rel);const folded=rel.toLowerCase();if(seen.has(folded)||seen.size>=10000)throw Error('upgrade_inventory_limit');seen.add(folded);
   if(item.isSymbolicLink())throw Error('upgrade_inventory_indirect');
   if(item.isDirectory()){directories.push(rel);await walk(file,rel);}
   else if(item.isFile()){
    const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>128*1024*1024||!canonicalPathEqual((await realpath(file)),file))throw Error('upgrade_inventory_indirect');
    const bytes=await readFile(file);if(bytes.length!==info.size||(total+=bytes.length)>128*1024*1024)throw Error('upgrade_inventory_limit');
    files.push({path:rel,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
   }else throw Error('upgrade_inventory_indirect');
  }
 }
 await walk(directory,'');if(!files.length||files.length>5000||directories.length>5000)throw Error('upgrade_inventory_limit');
 files.sort((a,b)=>a.path.localeCompare(b.path,'en'));directories.sort((a,b)=>a.localeCompare(b,'en'));
 // Cooperative maintenance excludes normative writers; direct OS access remains privileged.
 // 运维互斥排除规范写入者，直接操作系统访问仍属于受信权限。
 await requireDeploymentOperation(config,['backup']);if(await readInstanceLock(config))throw Error('upgrade_inventory_requires_stopped');
 return {format:'enterprise-brain.upgrade-database-inventory/1',enterpriseId:config.enterpriseId,deploymentId:config.deploymentId,configurationSha256:hash(config),dataSha256:hash({files,directories}),files:files.length,directories:directories.length,bytes:total,offline:true as const};
}
