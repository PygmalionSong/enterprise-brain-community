// Offline-only private installation changes share the deployment operation lock.
// 仅停服后修改私人安装，与部署运维共用互斥。
import {open,rename,unlink} from 'node:fs/promises';
import {dirname,join,isAbsolute,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {readDeployment,readPrivateJson} from './configuration.ts';
import {inspectToolInstallation} from './installed-tools.ts';
import {readInstanceLock,withDeploymentOperation} from './operation-guard.ts';
import {digest} from '../identity/service.ts';
export async function enterpriseToolStatus(configFile:string){const config=await readDeployment(configFile),installation=config.toolInstallationFile?await inspectToolInstallation(config.toolInstallationFile):null;return {configurationSha256:digest(JSON.stringify(config)),configured:!!installation,installationSha256:installation?.fingerprint??null,tools:installation?.value.tools.map(t=>({id:t.id,effect:t.effect}))??[]};}
export async function configureEnterpriseTools(configFile:string,inputFile:string){const input=z.object({expectedConfigurationSha256:z.string().regex(/^[a-f0-9]{64}$/),installationAcknowledged:z.literal(true),toolInstallationFile:z.string().refine(v=>isAbsolute(v)&&resolve(v)===v).nullable()}).strict().parse(await readPrivateJson(inputFile)),config=await readDeployment(configFile);if(digest(JSON.stringify(config))!==input.expectedConfigurationSha256)throw Error('enterprise_tools_configuration_conflict');return withDeploymentOperation(config,'tools',async()=>{
 if(await readInstanceLock(config))throw Error('enterprise_tools_require_stopped');if(digest(JSON.stringify(await readDeployment(configFile)))!==input.expectedConfigurationSha256)throw Error('enterprise_tools_configuration_conflict');if(input.toolInstallationFile)await inspectToolInstallation(input.toolInstallationFile);const next={...config};if(input.toolInstallationFile)next.toolInstallationFile=input.toolInstallationFile;else delete next.toolInstallationFile;const temporary=join(dirname(configFile),'config-'+randomUUID()+'.tmp');let handle,committed=false;
 try{handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(next,null,2));await handle.sync();await handle.close();handle=undefined;if(digest(JSON.stringify(await readDeployment(configFile)))!==input.expectedConfigurationSha256)throw Error('enterprise_tools_configuration_conflict');await rename(temporary,configFile);committed=true;}finally{await handle?.close();if(!committed)await unlink(temporary).catch(e=>{if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;});}
 return {configured:!!next.toolInstallationFile,configurationSha256:digest(JSON.stringify(next)),started:false};
 });}
