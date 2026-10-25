// Adopt an explicitly prepared dedicated database;never initialize or migrate it.
// 接入明确准备的专用企业库；不初始化、迁移或修改其业务内容。
import {readFile,lstat,realpath,mkdir,open,rename,unlink} from 'node:fs/promises';
import {join,dirname,basename,resolve,isAbsolute} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';import {z} from 'zod';
import {absolutePath,privateParent,readPrivateJson,readSecret,freshSecret} from './configuration.ts';
import {enterpriseHostSchema} from '../http/enterprise-policy.ts';
import {readSchemaInventory} from '../db/schema-health.ts';
import {connectNativeRuntime,isVerifiedNativeRuntimeConnection} from '../db/native-runtime-connection.ts';
import {createNativeEnterpriseApplication} from '../http/enterprise.ts';
import {defaultTrafficPolicy,initializeTrafficPolicy} from './traffic-policy.ts';

const absolute=z.string().max(1024).refine(v=>isAbsolute(v)&&resolve(v)===v),sha=z.string().regex(/^[a-f0-9]{64}$/),role=z.string().regex(/^[a-z][a-z0-9_]{0,62}$/);
const shared={enterpriseId:z.uuid(),runtimeRole:role,origin:enterpriseHostSchema.shape.origin,port:z.number().int().min(1024).max(65535),runtimeDescriptorFile:absolute,runtimeDescriptorSha256:sha};
export const nativeAdoptionSchema=z.object({...shared,adoptionAcknowledged:z.literal(true),dedicatedDatabaseAcknowledged:z.literal(true)}).strict();
export const nativeDeploymentSchema=z.object({format:z.literal(2),storage:z.literal('postgres'),deploymentId:z.uuid(),...shared,stateDirectory:absolute,proxyTokenFile:absolute,controlTokenFile:absolute}).strict();
export type NativeDeployment=z.infer<typeof nativeDeploymentSchema>;
const digest=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
function configurationPath(file:string){absolutePath(file);const folder=dirname(file),name=basename(folder);if(basename(file)!=='config.json'||!/^\p{L}[\p{L}\p{N} _.-]{0,79}$/u.test(name)||/[. ]$/.test(name)||/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)||folder.split(/[\\/]/).some(s=>/^\.(?:git|codex|agents)$/i.test(s)))throw Error('native_deployment_path_invalid');return folder;}
async function realDirectory(directory:string){const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink()||(await realpath(directory)).toLowerCase()!==directory.toLowerCase())throw Error('native_deployment_path_indirect');}
async function absent(file:string){try{await lstat(file);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}throw Error('native_deployment_target_exists');}
async function exclusive(file:string,value:string){const handle=await open(file,'wx',0o600);try{await handle.writeFile(value);await handle.sync();}finally{await handle.close();}}
export async function verifyNativeDescriptor(config:NativeDeployment){const file=config.runtimeDescriptorFile;await privateParent(file);const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>16384)throw Error('native_deployment_descriptor_invalid');const bytes=await readFile(file);if(bytes.length<1||bytes.length>16384||digest(bytes)!==config.runtimeDescriptorSha256)throw Error('native_deployment_descriptor_changed');}
// Status/stop bind the existing local identity even if the descriptor has drifted.
// 描述文件变动后仍可核对并停止原实例；此读取不能授权启动或更换数据库。
export async function readNativeControlDeployment(file:string){const folder=configurationPath(file),config=nativeDeploymentSchema.parse(await readPrivateJson(file));await realDirectory(folder);if(config.stateDirectory!==join(folder,'state')||config.proxyTokenFile!==join(folder,'proxy-token')||config.controlTokenFile!==join(folder,'control-token'))throw Error('native_deployment_path_mismatch');await realDirectory(config.stateDirectory);await readSecret(config.proxyTokenFile);await readSecret(config.controlTokenFile);return config;}
export async function readNativeDeployment(file:string){const config=await readNativeControlDeployment(file);await verifyNativeDescriptor(config);return config;}
export function nativeAdoptionClaimPath(configFile:string){const folder=configurationPath(configFile);return join(dirname(folder),'.native-adopt-'+digest(folder.toLowerCase())+'.json');}
export function planNativeAdoption(configFile:string,id:string=randomUUID(),createdAt:string=new Date().toISOString()){
 z.uuid().parse(id);z.iso.datetime().parse(createdAt);const target=configurationPath(configFile),staging=join(dirname(target),'.native-adopt-'+id),claim={format:1,id,pid:process.pid,target,staging,createdAt};return Object.freeze({id,createdAt,target,staging,claimFile:nativeAdoptionClaimPath(configFile),claimText:JSON.stringify(claim)});
}

export async function adoptNativeEnterprise(root:string,configFile:string,inputFile:string,plannedAttempt?:Readonly<{id:string;createdAt:string}>){
 absolutePath(root);const folder=configurationPath(configFile),input=nativeAdoptionSchema.parse(await readPrivateJson(inputFile)),parent=dirname(folder);await realDirectory(parent);await absent(folder);
 const expected=await readSchemaInventory(join(root,'migrations')),plan=planNativeAdoption(configFile,plannedAttempt?.id,plannedAttempt?.createdAt),{id,staging,claimFile,claimText}=plan;
 if(plannedAttempt){const raw=await readPrivateJson(claimFile);if(JSON.stringify(raw)!==claimText||await readFile(claimFile,'utf8')!==claimText)throw Error('native_adoption_claim_changed');}
 else try{await exclusive(claimFile,claimText);}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw Error('native_adoption_busy');throw e;}
 let connection:Awaited<ReturnType<typeof connectNativeRuntime>>|undefined,app:Awaited<ReturnType<typeof createNativeEnterpriseApplication>>|undefined,committed=false,staged=false;
 try{
  // The connection hashes and parses the same bounded bytes before reading credentials.
  // 连接核心散列并解析同一份有界字节，随后才读取凭证和连接网络。
  connection=await connectNativeRuntime(input.runtimeDescriptorFile,expected,input.runtimeDescriptorSha256);
  if(!isVerifiedNativeRuntimeConnection(connection.database,input.enterpriseId,input.runtimeRole,input.runtimeDescriptorSha256))throw Error('native_adoption_scope_mismatch');
  const config=nativeDeploymentSchema.parse({format:2,storage:'postgres',deploymentId:randomUUID(),enterpriseId:input.enterpriseId,runtimeRole:input.runtimeRole,origin:input.origin,port:input.port,runtimeDescriptorFile:input.runtimeDescriptorFile,runtimeDescriptorSha256:input.runtimeDescriptorSha256,stateDirectory:join(folder,'state'),proxyTokenFile:join(folder,'proxy-token'),controlTokenFile:join(folder,'control-token')}),proxyToken=freshSecret(),controlToken=freshSecret();
  app=await createNativeEnterpriseApplication(connection.database,root,{enterpriseId:config.enterpriseId,instanceId:config.deploymentId,origin:config.origin,proxyToken,controlToken},{enterpriseId:config.enterpriseId,runtimeRole:config.runtimeRole,ownershipAcknowledged:true});
  const dormant=await connection.database.transaction(async tx=>{await tx.exec("SET TRANSACTION READ ONLY; SET LOCAL ROLE eb_app; SET LOCAL statement_timeout='3000'; SET LOCAL lock_timeout='1000'");await tx.query("SELECT set_config('app.enterprise_id',$1,true)",[input.enterpriseId]);return (await tx.query('SELECT NOT EXISTS(SELECT 1 FROM planning_model_installation WHERE enterprise_id=$1) AND NOT EXISTS(SELECT 1 FROM process_graph_supervision WHERE enterprise_id=$1 AND enabled) AS dormant',[input.enterpriseId])).rows;});
  if(dormant.length!==1||dormant[0].dormant!==true)throw Error('native_adoption_external_configuration_present');
  await mkdir(staging,{mode:0o700});staged=true;await mkdir(join(staging,'state'),{mode:0o700});await exclusive(join(staging,'proxy-token'),proxyToken);await exclusive(join(staging,'control-token'),controlToken);
  await initializeTrafficPolicy({...config,stateDirectory:join(staging,'state')},defaultTrafficPolicy(config,'parked'));await exclusive(join(staging,'config.json'),JSON.stringify(config,null,2));
  await exclusive(join(staging,'adoption.json'),JSON.stringify({format:1,id,state:'prepared',dedicatedDatabaseAcknowledged:true,sourceRowsChanged:false,started:false}));
  await verifyNativeDescriptor(config);if(!await app.ready())throw Error('native_adoption_runtime_unavailable');await realDirectory(parent);await absent(folder);
  if(await readFile(claimFile,'utf8')!==claimText)throw Error('native_adoption_claim_changed');await rename(staging,folder);committed=true;
  return {adopted:true,enterpriseId:config.enterpriseId,deploymentId:config.deploymentId,configuration:configFile,traffic:'parked',started:false,databaseMigrated:false,accountsCreated:false,modelConfigured:false};
 }finally{
  // Failed claims/staging remain private evidence;never steal,overwrite or recursively delete.
  // 失败声明/暂存保留为私人证据，不窃取、覆盖或递归删除。
  try{await app?.close();}finally{await connection?.database.close();}
  if(committed){if(await readFile(claimFile,'utf8')!==claimText)throw Error('native_adoption_claim_changed');await unlink(claimFile);}
  else if(staged){/* Inspect the target-bound claim and prepared stage before manual recovery. / 人工核对目标声明和暂存后再恢复。 */}
 }
}
