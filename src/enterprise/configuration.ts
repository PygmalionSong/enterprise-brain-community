// Private deployment paths and secret files are never accepted over the HTTP API.
// 私人部署路径与密钥文件不经HTTP接口接收。
import {readFile,writeFile,lstat,mkdir,realpath} from 'node:fs/promises';
import {resolve,dirname,join,isAbsolute} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {enterpriseHostSchema} from '../http/enterprise-policy.ts';
import {validPassword,validUsername} from '../identity/credentials.ts';
import {openDatabase} from '../db/adapter.ts';
import {migrate} from '../db/migrate.ts';
import {readSchemaInventory} from '../db/schema-health.ts';
import {IdentityService} from '../identity/service.ts';
import {OperatorDirectory} from '../identity/operators.ts';
import {initializeTrafficPolicy} from './traffic-policy.ts';

const origin=enterpriseHostSchema.shape.origin;
export const deploymentSchema=z.object({format:z.literal(1),deploymentId:z.uuid(),enterpriseId:z.uuid(),origin,port:z.number().int().min(1024).max(65535),stateDirectory:z.string(),proxyTokenFile:z.string(),controlTokenFile:z.string(),toolInstallationFile:z.string().refine(v=>isAbsolute(v)&&resolve(v)===v).optional()}).strict();
export type EnterpriseDeployment=z.infer<typeof deploymentSchema>;
// Shared local operations bind the complete actual configuration at runtime.
// 共用本机运维在运行时绑定实际完整配置，不只散列这些结构字段。
export type OperationalDeployment=Pick<EnterpriseDeployment,'deploymentId'|'port'|'stateDirectory'>;
export const initializationSchema=z.object({enterpriseId:z.uuid().optional(),name:z.string().min(1).max(100),currency:z.enum(['CNY','USD','JPY','EUR']).default('CNY'),timezone:z.string().max(80).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}}),origin,port:z.number().int().min(1024).max(65535),username:z.string().refine(validUsername),password:z.string().refine(validPassword),toolInstallationFile:z.string().refine(v=>isAbsolute(v)&&resolve(v)===v).optional()}).strict();
export function absolutePath(file:string){if(!isAbsolute(file)||resolve(file)!==file)throw Error('enterprise_absolute_path_required');return file;}
export async function privateParent(file:string){absolutePath(file);const parent=dirname(file),actual=await realpath(parent);if(actual.toLowerCase()!==parent.toLowerCase())throw Error('enterprise_private_path_indirect');return parent;}
export async function readPrivateJson(file:string,max=16384):Promise<any>{absolutePath(file);const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)throw Error('enterprise_private_file_invalid');await privateParent(file);const bytes=await readFile(file);if(bytes.length>max)throw Error('enterprise_private_file_invalid');try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('enterprise_private_json_invalid');}}
export async function readDeployment(file:string){const q=deploymentSchema.parse(await readPrivateJson(file)),parent=dirname(file);if(q.stateDirectory!==join(parent,'state')||q.proxyTokenFile!==join(parent,'proxy-token')||q.controlTokenFile!==join(parent,'control-token'))throw Error('enterprise_private_path_mismatch');const state=await lstat(q.stateDirectory);if(!state.isDirectory()||state.isSymbolicLink()||(await realpath(q.stateDirectory)).toLowerCase()!==q.stateDirectory.toLowerCase())throw Error('enterprise_private_path_indirect');const database=join(q.stateDirectory,'database');try{const info=await lstat(database);if(!info.isDirectory()||info.isSymbolicLink()||(await realpath(database)).toLowerCase()!==database.toLowerCase())throw Error('enterprise_private_path_indirect');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}return q;}
export async function readSecret(file:string){absolutePath(file);await privateParent(file);const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size!==43)throw Error('enterprise_secret_invalid');const value=await readFile(file,'utf8');if(!/^[A-Za-z0-9_-]{43}$/.test(value))throw Error('enterprise_secret_invalid');return value;}
export const freshSecret=()=>randomBytes(32).toString('base64url');
export async function writeDeployment(file:string,metadata:Omit<EnterpriseDeployment,'format'|'stateDirectory'|'proxyTokenFile'|'controlTokenFile'>,proxyToken=freshSecret()){
 if(!/^[A-Za-z0-9_-]{43}$/.test(proxyToken))throw Error('enterprise_secret_invalid');
 absolutePath(file);const parent=dirname(file);await mkdir(parent,{recursive:true,mode:0o700});await privateParent(file);
 const q=deploymentSchema.parse({format:1,...metadata,stateDirectory:join(parent,'state'),proxyTokenFile:join(parent,'proxy-token'),controlTokenFile:join(parent,'control-token')});
 await mkdir(q.stateDirectory,{recursive:false,mode:0o700});await writeFile(q.proxyTokenFile,proxyToken,{flag:'wx',mode:0o600});await writeFile(q.controlTokenFile,freshSecret(),{flag:'wx',mode:0o600});
 return q;
}
export async function initializeEnterprise(root:string,configFile:string,inputFile:string){
 absolutePath(configFile);const input=initializationSchema.parse(await readPrivateJson(inputFile));await readSchemaInventory(join(root,'migrations'));let exists=false;try{await lstat(configFile);exists=true;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}if(exists)throw Error('enterprise_configuration_exists');
 if(input.toolInstallationFile){const {inspectToolInstallation}=await import('./installed-tools.ts');await inspectToolInstallation(input.toolInstallationFile);}const enterpriseId=input.enterpriseId??randomUUID(),q=await writeDeployment(configFile,{deploymentId:randomUUID(),enterpriseId,origin:input.origin,port:input.port,toolInstallationFile:input.toolInstallationFile}),db=await openDatabase(join(q.stateDirectory,'database'));
 try{await migrate(db,join(root,'migrations'));await db.query("INSERT INTO enterprise VALUES($1,$2,'enterprise',$3,$4)",[enterpriseId,input.name,input.currency,input.timezone]);const identity=new IdentityService(db),operators=new OperatorDirectory(db),token=await identity.issueBootstrap(enterpriseId);await operators.initialize(token,{username:input.username,password:input.password});await initializeTrafficPolicy(q);await writeFile(configFile,JSON.stringify(q,null,2),{flag:'wx',mode:0o600});}
 finally{await db.close();}
 return {initialized:true,enterpriseId,deploymentId:q.deploymentId,configuration:configFile,modelConfigured:false,demoSeedLoaded:false};
}
