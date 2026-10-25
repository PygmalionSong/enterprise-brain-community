// Offline native upgrade planning; no credentials, database connections or candidate execution.
// 离线原生升级规划；不读凭证、不连接数据库、不执行候选代码。
import {readFile,lstat,realpath,open} from 'node:fs/promises';
import {resolve,dirname,join,isAbsolute,relative} from 'node:path';
import {createHash} from 'node:crypto';import {z} from 'zod';
import {inspectUpgradeInstallations,type UpgradeStaticReport} from '../../scripts/upgrade-preflight.mjs';
import {nativeDeploymentSchema} from './native-configuration.ts';
import {nativeRuntimeDescriptorSchema} from '../db/native-runtime-connection.ts';
const absolute=z.string().max(1024).refine(v=>isAbsolute(v)&&resolve(v)===v),sha=z.string().regex(/^[a-f0-9]{64}$/);
export const nativeUpgradePlanInputSchema=z.object({format:z.literal('enterprise-brain.native-upgrade-plan-input/1'),currentRoot:absolute,candidateRoot:absolute,publicKeyFile:absolute,pinnedFingerprint:sha,currentConfigFile:absolute,expectedConfigurationSha256:sha,expectedCurrentManifestSha256:sha,expectedCandidateManifestSha256:sha,planningAcknowledged:z.literal(true)}).strict();
export type NativeUpgradePlanInput=z.infer<typeof nativeUpgradePlanInputSchema>;
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const inside=(root:string,file:string)=>{const r=relative(root.toLowerCase(),file.toLowerCase());return r===''||!r.startsWith('..')&&!isAbsolute(r);};
async function direct(file:string,directory=false){absolute.parse(file);const s=await lstat(file);if(s.isSymbolicLink()||(directory?!s.isDirectory():!s.isFile())||(await realpath(file)).toLowerCase()!==file.toLowerCase())throw Error('native_upgrade_indirect_path');return s;}
async function bytes(file:string,max:number){const s=await direct(file);if(s.size<1||s.size>max)throw Error('native_upgrade_input_limit');const b=await readFile(file);if(b.length<1||b.length>max)throw Error('native_upgrade_input_limit');return b;}
const json=(b:Buffer)=>{try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));}catch{throw Error('native_upgrade_json_invalid');}};
function privateOutside(q:NativeUpgradePlanInput,files:string[]){for(const root of [q.currentRoot,q.candidateRoot])for(const f of files)if(inside(root,f)||inside(f,root))throw Error('native_upgrade_private_path_overlap');}
async function nativeContract(root:string,manifestSha256:string){
 const signed=json(await bytes(join(root,'RELEASE.json'),2*1024*1024));if(hash(signed.manifestText)!==manifestSha256)throw Error('native_upgrade_installation_changed');
 const manifest=JSON.parse(signed.manifestText),entries=new Map<string,{sha256:string;size:number}>(manifest.entries.map((e:{path:string;sha256:string;size:number})=>[e.path,e]));
 for(const file of ['src/enterprise/native-service.ts','src/enterprise/native-configuration.ts','src/db/native-runtime-connection.ts','scripts/enterprise-native.mjs','scripts/native-backup-worker.ps1','scripts/native-restore-worker.ps1']){const e=entries.get(file);if(!e)throw Error('native_upgrade_native_contract_missing');const b=await bytes(join(root,file),2*1024*1024);if(hash(b)!==e.sha256||b.length!==e.size)throw Error('native_upgrade_installation_changed');}
 // New generations must ship their bound upgrade CLI before private configuration is opened.
 // 新代安装必须先携带被身份绑定的升级CLI，再读取私人配置；旧签名代不受影响。
 if(entries.has('src/enterprise/native-upgrade-candidate.ts')&&!entries.has('scripts/native-upgrade.mjs'))throw Error('native_upgrade_native_contract_missing');
}
function fixedStatic(r:UpgradeStaticReport){const {createdAt,...fixed}=r;return fixed;}
export async function inspectNativeUpgradePlan(inputFile:string,reportFile?:string){
 const requestBytes=await bytes(inputFile,16384),q=nativeUpgradePlanInputSchema.parse(json(requestBytes));
 privateOutside(q,[inputFile,q.publicKeyFile,q.currentConfigFile,...(reportFile?[reportFile]:[])]);
 if(reportFile){absolute.parse(reportFile);await direct(dirname(reportFile),true);if(inside(dirname(q.currentConfigFile),reportFile)||reportFile===inputFile||reportFile===q.publicKeyFile)throw Error('native_upgrade_report_path_overlap');}
 const staticInput={format:1,currentRoot:q.currentRoot,candidateRoot:q.candidateRoot,publicKeyFile:q.publicKeyFile,pinnedFingerprint:q.pinnedFingerprint},key=await bytes(q.publicKeyFile,4096);
 // Authenticate all signed files before reading even the private deployment descriptor.
 // 全部签名文件认证先于读取私人部署描述，候选代码永远不导入。
 const initial=await inspectUpgradeInstallations(staticInput);
 if(initial.current.manifestSha256!==q.expectedCurrentManifestSha256||initial.candidate.manifestSha256!==q.expectedCandidateManifestSha256)throw Error('native_upgrade_manifest_binding_changed');
 if(initial.dependencyLockChanged)throw Error('native_upgrade_dependency_change_unqualified');
 if(initial.runtimeProfileChanged)throw Error('native_upgrade_runtime_change_unqualified');
 if(initial.candidate.schemaFiles>999)throw Error('native_upgrade_migration_limit');
 await nativeContract(q.currentRoot,initial.current.manifestSha256);await nativeContract(q.candidateRoot,initial.candidate.manifestSha256);
 const configBytes=await bytes(q.currentConfigFile,16384);if(hash(configBytes)!==q.expectedConfigurationSha256)throw Error('native_upgrade_configuration_changed');
 const config=nativeDeploymentSchema.parse(json(configBytes)),folder=dirname(q.currentConfigFile);await direct(folder,true);await direct(config.stateDirectory,true);
 if(join(folder,'config.json')!==q.currentConfigFile||config.stateDirectory!==join(folder,'state')||config.proxyTokenFile!==join(folder,'proxy-token')||config.controlTokenFile!==join(folder,'control-token'))throw Error('native_upgrade_configuration_path_mismatch');
 privateOutside(q,[config.stateDirectory,config.proxyTokenFile,config.controlTokenFile,config.runtimeDescriptorFile]);
 const descriptorBytes=await bytes(config.runtimeDescriptorFile,16384);if(hash(descriptorBytes)!==config.runtimeDescriptorSha256)throw Error('native_upgrade_descriptor_changed');
 const descriptor=nativeRuntimeDescriptorSchema.parse(json(descriptorBytes));
 if(descriptor.tls.mode!=='verify-full'||descriptor.enterpriseId!==config.enterpriseId||descriptor.runtimeRole!==config.runtimeRole)throw Error('native_upgrade_runtime_scope_mismatch');
 privateOutside(q,[descriptor.passwordFile,descriptor.tls.caFile]);
 // Two full static observations and exact private bytes fence ordinary concurrent changes.
 // 两次完整静态观察与准确私人字节核对，拒绝规范并发修改；不宣称冻结特权文件写入。
 const final=await inspectUpgradeInstallations(staticInput);
 if(JSON.stringify(fixedStatic(initial))!==JSON.stringify(fixedStatic(final))||!(await bytes(q.publicKeyFile,4096)).equals(key)||!(await bytes(inputFile,16384)).equals(requestBytes)||!(await bytes(q.currentConfigFile,16384)).equals(configBytes)||!(await bytes(config.runtimeDescriptorFile,16384)).equals(descriptorBytes))throw Error('native_upgrade_plan_changed');
 return {format:'enterprise-brain.native-upgrade-plan/1' as const,createdAt:new Date().toISOString(),status:'NATIVE_STATIC_ELIGIBLE_DATABASE_REVIEW_REQUIRED' as const,binding:{inputSha256:hash(requestBytes),configurationSha256:hash(configBytes),runtimeDescriptorSha256:hash(descriptorBytes),publicKeySha256:hash(key),currentManifestSha256:q.expectedCurrentManifestSha256,candidateManifestSha256:q.expectedCandidateManifestSha256,publisherFingerprint:q.pinnedFingerprint,enterpriseId:config.enterpriseId,deploymentId:config.deploymentId},static:final,scope:{storage:'postgres' as const,databaseChecked:false as const,credentialsRead:false as const,credentialsBound:false as const,privilegedConnectionOpened:false as const,candidateExecuted:false as const,sqlExecuted:false as const,serviceChanged:false as const,backupCreated:false as const,rehearsalPassed:false as const,canMigrate:false as const,canCutover:false as const,productionReady:false as const},next:'Explicit runtime/database review,owned online park/drain/fresh backup,authorized isolated rehearsal and durable commit protocol are still required'};
}
export async function planNativeUpgrade(inputFile:string,outputFile:string){
 const report=await inspectNativeUpgradePlan(inputFile,outputFile),text=JSON.stringify(report,null,2)+'\n';if(Buffer.byteLength(text)>8*1024*1024)throw Error('native_upgrade_report_limit');
 const handle=await open(outputFile,'wx',0o600);try{await handle.writeFile(text);await handle.sync();}finally{await handle.close();}return report;
}
