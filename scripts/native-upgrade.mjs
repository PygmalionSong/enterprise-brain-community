// Explicit trusted local operations; no implicit upgrade,start,activation or fallback.
// 显式受信本机运维，不隐式升级、启动、激活或回退。
import {resolve,dirname,isAbsolute} from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
import{manageNativeLinuxCLI}from'./native-linux-managed.mjs';

try{
 const managedExit=await manageNativeLinuxCLI('native-upgrade.mjs',process.argv.slice(2),['restore-target','commit-target','finish-target','managed-start'].includes(process.argv[2]));if(managedExit!==null)process.exit(managedExit);
 const [command,flag,file,...rest]=process.argv.slice(2),phases={'backup':'prepareNativeUpgradeBackup','stop-source':'stopNativeUpgradeSource','restore-target':'restoreNativeUpgradeTarget','commit-target':'commitNativeUpgradeTarget','finish-target':'finishNativeUpgradeTarget','prepare-candidate':'prepareNativeUpgradeCandidate','finish-candidate':'finishNativeUpgradeCandidate','commit-pointer':'commitNativeUpgradePointer','finish-pointer':'finishNativeUpgradePointer','abandon':'abandonNativeUpgradeSource','abandon-target':'abandonNativeUpgradeRestoredTarget','finish-abandonment':'finishNativeUpgradeAbandonment'},managed=['managed-start','managed-status','managed-stop'];
 const phase=Object.hasOwn(phases,command),jobCommand=command==='inspect'||managed.includes(command);
 if(rest.length||!file||!isAbsolute(file)||resolve(file)!==file||(!phase&&!jobCommand)||flag!==(jobCommand?'--job':'--input'))throw Error('native_upgrade_usage_invalid');
 const ops=await import(pathToFileURL(resolve(root,'dist/enterprise-operations.mjs')));let result;
 if(phase)result=await ops[phases[command]](file);
 else if(command==='inspect')result=await ops.inspectNativeUpgradeJob(file);
 else{const installation=await ops.readNativeUpgradeCommittedInstallation(file,false,command!=='managed-start'),candidate=await import(pathToFileURL(resolve(installation.root,'dist/enterprise-operations.mjs')));
  if(command==='managed-status')result=await candidate.nativeEnterpriseStatus(installation.configuration);
  else if(command==='managed-stop')result=await candidate.stopNativeEnterprise(installation.configuration);
  else{const service=await candidate.startNativeEnterprise(installation.root,installation.configuration);result=service.status;if(!service.alreadyRunning){const stop=()=>{void service.close().catch(()=>{process.exitCode=1;});};process.once('SIGINT',stop);process.once('SIGTERM',stop);}}
 }
 console.log(JSON.stringify(result));
}catch(e){const code=/^(?:enterprise|native|budget_period)_[a-z_]+$/.test(e?.message??'')?e.message:'native_upgrade_operation_failed';console.error(JSON.stringify({code}));process.exitCode=1;}
