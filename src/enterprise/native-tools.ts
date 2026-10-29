// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Deployment-bound, versioned private policy; configuring a catalogue starts no process.
// 部署绑定的版本化私人策略；配置工具目录不会启动进程。
import {readFile,lstat,open,rename,unlink} from 'node:fs/promises';
import {join,isAbsolute,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import type {Database} from '../db/adapter.ts';
import {GraphToolCatalog} from '../runtime/graph-contracts.ts';
import {hash} from '../runtime/contracts.ts';
import {digest} from '../identity/service.ts';
import {privateParent,readPrivateJson} from './configuration.ts';
import {readNativeDeployment,type NativeDeployment} from './native-configuration.ts';
import {inspectToolInstallation,installedEnterpriseTools} from './installed-tools.ts';
import {withStoppedNativeConfiguration} from './native-configuration-operation.ts';

const sha=z.string().regex(/^[a-f0-9]{64}$/),version=z.number().int().min(0).max(2147483646),absolute=z.string().max(1024).refine(v=>isAbsolute(v)&&resolve(v)===v);
export const nativeToolPolicySchema=z.object({format:z.literal(1),deploymentId:z.uuid(),configurationSha256:sha,version:version.refine(v=>v>0),installation:z.object({file:absolute,sha256:sha}).strict().nullable()}).strict();
export const nativeToolChangeSchema=z.object({expectedConfigurationSha256:sha,expectedVersion:version,expectedPolicySha256:sha.nullable(),installationAcknowledged:z.literal(true),toolInstallationFile:absolute.nullable()}).strict();
export async function readNativeToolPolicy(config:NativeDeployment){
 const file=join(config.stateDirectory,'native-tools.json');let info;try{info=await lstat(file);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {policy:null,sha256:null};throw e;}
 await privateParent(file);if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>16384)throw Error('native_tools_policy_invalid');
 const bytes=await readFile(file);let policy;try{if(bytes.length<1||bytes.length>16384)throw Error('size');policy=nativeToolPolicySchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}catch{throw Error('native_tools_policy_invalid');}
 if(policy.deploymentId!==config.deploymentId||policy.configurationSha256!==digest(JSON.stringify(config)))throw Error('native_tools_policy_mismatch');
 return {policy,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export async function nativeEnterpriseToolStatus(configFile:string){
 const config=await readNativeDeployment(configFile),snapshot=await readNativeToolPolicy(config),binding=snapshot.policy?.installation;
 const installation=binding?await inspectToolInstallation(binding.file):null;if(installation&&installation.fingerprint!==binding!.sha256)throw Error('native_tools_installation_changed');
 return {configurationSha256:digest(JSON.stringify(config)),policyVersion:snapshot.policy?.version??0,policySha256:snapshot.sha256,configured:!!installation,installationSha256:installation?.fingerprint??null,tools:installation?.value.tools.map(t=>({id:t.id,effect:t.effect}))??[],sourceContacted:false};
}
export async function configureNativeEnterpriseTools(root:string,configFile:string,inputFile:string){
 const request=nativeToolChangeSchema.parse(await readPrivateJson(inputFile)),config=await readNativeDeployment(configFile),configurationSha256=digest(JSON.stringify(config));
 if(configurationSha256!==request.expectedConfigurationSha256)throw Error('native_tools_configuration_conflict');
 return withStoppedNativeConfiguration(root,configFile,config,'tools',async(_db,guard)=>{
  const prior=await readNativeToolPolicy(config);if(prior.sha256!==request.expectedPolicySha256||(prior.policy?.version??0)!==request.expectedVersion||request.expectedVersion>=2147483646)throw Error('native_tools_policy_conflict');
  const installation=request.toolInstallationFile?await inspectToolInstallation(request.toolInstallationFile):null;
  const next=nativeToolPolicySchema.parse({format:1,deploymentId:config.deploymentId,configurationSha256,version:request.expectedVersion+1,installation:installation?{file:request.toolInstallationFile,sha256:installation.fingerprint}:null}),bytes=JSON.stringify(next,null,2),file=join(config.stateDirectory,'native-tools.json'),temporary=join(config.stateDirectory,'native-tools-'+randomUUID()+'.pending');let handle,committed=false;
  try{
   handle=await open(temporary,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=undefined;
   await guard();if((await readNativeToolPolicy(config)).sha256!==prior.sha256)throw Error('native_tools_policy_conflict');
   if(next.installation&&(await inspectToolInstallation(next.installation.file)).fingerprint!==next.installation.sha256)throw Error('native_tools_installation_changed');
   await guard();await rename(temporary,file);committed=true;
   return {configured:!!installation,policyVersion:next.version,policySha256:digest(bytes),installationSha256:installation?.fingerprint??null,configurationSha256,sourceContacted:false,started:false};
  }finally{await handle?.close();if(!committed)await unlink(temporary).catch(e=>{if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;});}
 });
}
export async function loadNativeEnterpriseTools(db:Database,config:NativeDeployment){
 const original=await readNativeToolPolicy(config),binding=original.policy?.installation;
 const guard=async()=>{if((await readNativeToolPolicy(config)).sha256!==original.sha256)throw Error('native_tools_policy_changed');if(binding&&hash(await readPrivateJson(binding.file,256*1024))!==binding.sha256)throw Error('native_tools_installation_changed');};
 if(binding&&(await inspectToolInstallation(binding.file)).fingerprint!==binding.sha256)throw Error('native_tools_installation_changed');
 const installed=await installedEnterpriseTools(db,binding?.file,guard);await guard();

 // Even a return to the same installation needs new versions and explicit approval.
 // 即使重新安装相同工具，也使用新版本并要求重新批准。
 return new GraphToolCatalog(installed.describe().map(d=>{
  const tool=installed.get(d.id,d.version),version=original.sha256===null?d.version:'policy_'+hash({policy:original.sha256,id:d.id,version:d.version});
  return {...tool,version,authorize:async(actor,args)=>{await guard();await tool.authorize(actor,args);await guard();},submit:async(actor,args,reference,signal)=>{await guard();return tool.submit(actor,args,reference,signal);},lookup:async(actor,args,reference,signal)=>{await guard();return tool.lookup(actor,args,reference,signal);}};
 }));
}
