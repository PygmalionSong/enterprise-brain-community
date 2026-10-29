// Native private operations are explicit and never fall back to PGlite initialization.
// 原生私人运维须显式选择，不回退到PGlite初始化。
import {resolve,dirname,isAbsolute} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
import{manageNativeLinuxCLI}from'./native-linux-managed.mjs';

try{
 const managedExit=await manageNativeLinuxCLI('enterprise-native.mjs',process.argv.slice(2),['start','restore'].includes(process.argv[2]));if(managedExit!==null)process.exit(managedExit);
 const [command,...args]=process.argv.slice(2),commands=['prepare','adopt','restore','start','status','stop','traffic-status','park','activate','inspect-locks','recover-locks','backup','backup-status','cancel-backup','inspect-backup','recover-backup','model-status','configure-model','tools-status','configure-tools','budget-period'],allowed=['prepare','adopt','restore','park','activate','recover-locks','backup','cancel-backup','recover-backup','configure-model','configure-tools','budget-period'].includes(command)?['--config','--input']:['--config'];if(!commands.includes(command)||args.length!==allowed.length*2)throw Error('native_enterprise_usage_invalid');const options={};for(let i=0;i<args.length;i+=2){if(!allowed.includes(args[i])||options[args[i]]||!isAbsolute(args[i+1]))throw Error('native_enterprise_usage_invalid');options[args[i]]=args[i+1];}if(allowed.some(k=>!options[k]))throw Error('native_enterprise_usage_invalid');
 const operations=await import(pathToFileURL(resolve(root,'dist/enterprise-operations.mjs')));let result;
 if(command==='prepare')result=await operations.prepareNativeEnterprise(root,options['--config'],options['--input']);
 else if(command==='budget-period')result=await operations.nativeEnterpriseBudgetPeriod(root,options['--config'],options['--input']);
 else if(command==='model-status')result=await operations.nativeEnterpriseModelStatus(root,options['--config']);
 else if(command==='configure-model')result=await operations.configureNativeEnterpriseModel(root,options['--config'],options['--input']);
 else if(command==='tools-status')result=await operations.nativeEnterpriseToolStatus(options['--config']);
 else if(command==='configure-tools')result=await operations.configureNativeEnterpriseTools(root,options['--config'],options['--input']);
 else if(command==='restore')result=await operations.restoreNativeEnterprise(root,options['--config'],options['--input']);
 else if(command==='adopt')result=await operations.adoptNativeEnterprise(root,options['--config'],options['--input']);
 else if(command==='start'){const service=await operations.startNativeEnterprise(root,options['--config']);result=service.status;if(!service.alreadyRunning){const stop=()=>{void service.close().catch(()=>{process.exitCode=1;});};process.once('SIGINT',stop);process.once('SIGTERM',stop);}}
 else if(command==='inspect-backup')result=await operations.inspectNativeBackupRecovery(root,options['--config']);else if(command==='recover-backup')result=await operations.recoverNativeBackupTask(root,options['--config'],options['--input']);
 else if(['backup','backup-status','cancel-backup'].includes(command))result=await operations.controlNativeBackup(options['--config'],command==='backup'?'start':command==='cancel-backup'?'cancel':'status',options['--input']);
 else if(command==='inspect-locks')result=await operations.inspectNativeEnterpriseLocks(options['--config']);else if(command==='recover-locks')result=await operations.recoverNativeEnterpriseLocks(options['--config'],options['--input']);else if(command==='status')result=await operations.nativeEnterpriseStatus(options['--config']);else if(command==='stop')result=await operations.stopNativeEnterprise(options['--config']);else result=await operations.nativeEnterpriseTraffic(options['--config'],command==='park'?'parked':command==='activate'?'active':'status',options['--input']);
 console.log(JSON.stringify(result));
}catch(e){const code=/^(?:enterprise|native|budget_period)_[a-z_]+$/.test(e?.message??'')?e.message:'native_enterprise_operation_failed';console.error(JSON.stringify({code}));process.exitCode=1;}
