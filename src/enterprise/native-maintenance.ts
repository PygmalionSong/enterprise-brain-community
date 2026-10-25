import {assertNoPendingNativeBackup} from './native-backup-journal.ts';
// Local claim recovery never connects to or takes ownership of a native database.
// 本机声明恢复不连接或接管原生数据库。
import {readNativeControlDeployment} from './native-configuration.ts';
import {readPrivateJson} from './configuration.ts';
import {inspectDeploymentLocks,recoverDeploymentLocks} from './maintenance.ts';
export async function inspectNativeEnterpriseLocks(configFile:string){return inspectDeploymentLocks(await readNativeControlDeployment(configFile));}
export async function recoverNativeEnterpriseLocks(configFile:string,inputFile:string){const input=await readPrivateJson(inputFile),config=await readNativeControlDeployment(configFile);await assertNoPendingNativeBackup(config);return recoverDeploymentLocks(config,input);}
