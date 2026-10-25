// Prepare a fresh parked candidate under cooperative maintenance claims. Never switch or activate.
// 持有规范运维互斥声明，准备本次停放后的全新候选；不切换、不激活。
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname,join,relative,isAbsolute} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {preflightUpgrade} from './upgrade-preflight.mjs';
import {rehearseUpgrade} from './rehearse-upgrade.mjs';
import {verifyTree} from './release.mjs';
import {readDeployment,readPrivateJson} from '../src/enterprise/configuration.ts';
import {withDeploymentOperation,readInstanceLock} from '../src/enterprise/operation-guard.ts';
import {enterpriseTrafficUnderClaim} from '../src/enterprise/traffic-operations.ts';
import {backupEnterpriseUnderClaim} from '../src/enterprise/recovery.ts';
import {captureUpgradeDatabase} from '../src/enterprise/upgrade-inventory.ts';
import {openDatabase} from '../src/db/adapter.ts';
import {createUpgradeControl,readUpgradeControl,updateUpgradeControl,inspectUpgradeControl} from '../src/enterprise/upgrade-control.ts';
import {hash} from '../src/runtime/contracts.ts';
import {randomUUID} from 'node:crypto';

const sha=value=>createHash('sha256').update(value).digest('hex');
export const upgradePreparationInputSchema=z.object({format:z.literal(1),currentRoot:z.string(),candidateRoot:z.string(),publicKeyFile:z.string(),pinnedFingerprint:z.string().regex(/^[a-f0-9]{64}$/),currentConfigFile:z.string(),jobDirectory:z.string(),preparationAcknowledged:z.literal(true)}).strict();
const inside=(root,file)=>{const rel=relative(root,file);return rel===''||!rel.startsWith('..')&&!isAbsolute(rel);};
async function direct(file,directory=false){if(!isAbsolute(file)||resolve(file)!==file)throw Error('upgrade_prepare_absolute_path_required');const stat=await lstat(file);if(stat.isSymbolicLink()||(directory?!stat.isDirectory():!stat.isFile())||(await realpath(file)).toLowerCase()!==file.toLowerCase())throw Error('upgrade_prepare_indirect_path');return stat;}
async function absent(file){try{await lstat(file);}catch(e){if(e.code==='ENOENT')return;throw e;}throw Error('upgrade_prepare_target_exists');}
async function write(file,value){const text=JSON.stringify(value,null,2)+'\n';if(Buffer.byteLength(text)>131072)throw Error('upgrade_prepare_receipt_limit');await writeFile(file,text,{flag:'wx',mode:0o600});return sha(text);}
const failureCode=e=>/^(upgrade|rehearsal|release|enterprise)_[a-z_]{1,80}$/.test(e?.message??'')?'upgrade_prepare_'+e.message.slice(0,50):'upgrade_prepare_stage_failed';

export async function prepareEnterpriseUpgrade(inputFile){
 if(process.platform!=='win32'||process.arch!=='x64'||process.versions.node!=='24.19.0')throw Error('upgrade_prepare_host_unverified');
 const q=upgradePreparationInputSchema.parse(await readPrivateJson(inputFile));
 for(const file of [q.currentRoot,q.candidateRoot,q.publicKeyFile,q.currentConfigFile,q.jobDirectory])if(!isAbsolute(file)||resolve(file)!==file)throw Error('upgrade_prepare_absolute_path_required');
 await direct(dirname(q.jobDirectory),true);await absent(q.jobDirectory);
 const currentConfig=await readDeployment(q.currentConfigFile);
 for(const install of [q.currentRoot,q.candidateRoot])for(const file of [inputFile,q.publicKeyFile,q.currentConfigFile,q.jobDirectory])if(inside(install,file)||inside(file,install))throw Error('upgrade_prepare_path_overlap');
 for(const file of [inputFile,q.publicKeyFile,q.currentConfigFile,currentConfig.stateDirectory])if(inside(q.jobDirectory,file)||inside(file,q.jobDirectory)||inside(dirname(q.currentConfigFile),q.jobDirectory))throw Error('upgrade_prepare_path_overlap');
 await mkdir(q.jobDirectory,{recursive:false,mode:0o700});
 const controlFile=join(q.jobDirectory,'control.json'),preflightFile=join(q.jobDirectory,'preflight.json'),preflightInput=join(q.jobDirectory,'preflight-input.json'),shadowConfig=join(q.jobDirectory,'candidate/config.json');
 await write(preflightInput,{format:1,currentRoot:q.currentRoot,candidateRoot:q.candidateRoot,publicKeyFile:q.publicKeyFile,pinnedFingerprint:q.pinnedFingerprint});
 const preflight=await preflightUpgrade(preflightInput,preflightFile);
 if(preflight.dependencyLockChanged)throw Error('upgrade_prepare_dependency_change_unqualified');
 // Copy the reviewed plan into this private job; all future evidence binds its exact parsed content.
 // 在私人任务中保留已核对计划，后续证据绑定完整计划，不由浏览器指定路径。
 await write(join(q.jobDirectory,'plan.json'),q);
 await createUpgradeControl(controlFile,{enterpriseId:currentConfig.enterpriseId,deploymentId:currentConfig.deploymentId,configurationSha256:hash(currentConfig),planSha256:hash(q),currentManifestSha256:preflight.current.manifestSha256,candidateManifestSha256:preflight.candidate.manifestSha256,publisherFingerprint:q.pinnedFingerprint});
 let state=await readUpgradeControl(controlFile),backup,rehearsal,application;
 async function stage(target,run){
  const operationId=randomUUID(),intentSha256=hash({job:state.id,binding:state.bindingSha256,target,previousEvidenceSha256:state.events.at(-1)?.evidenceSha256??null});
  state=await updateUpgradeControl(controlFile,{action:'begin',expectedVersion:state.version,operationId,targetStage:target,intentSha256});
  let receipt;
  try{receipt=await run();}catch(e){const code=failureCode(e);state=await updateUpgradeControl(controlFile,{action:'fail',expectedVersion:state.version,operationId,code});throw Error(code);}
  const evidenceSha256=await write(join(q.jobDirectory,target+'.receipt.json'),{format:1,upgradeId:state.id,operationId,bindingSha256:state.bindingSha256,target,receipt});
  // Failure after an external effect leaves pending intent for inspection, not an automatic retry.
  // 外部效果后若持久化失败，保留pending待核对，不能自动重复执行。
  state=await updateUpgradeControl(controlFile,{action:'complete',expectedVersion:state.version,operationId,evidenceSha256});
 }
 await withDeploymentOperation(currentConfig,'backup',async()=>{
  if(hash(await readDeployment(q.currentConfigFile))!==state.binding.configurationSha256)throw Error('upgrade_prepare_configuration_changed');
  await verifyTree(q.currentRoot,q.publicKeyFile,q.pinnedFingerprint);await verifyTree(q.candidateRoot,q.publicKeyFile,q.pinnedFingerprint);
  await stage('quiesced',async()=>{
   const status=await enterpriseTrafficUnderClaim(q.currentConfigFile,'status');
   const input=join(q.jobDirectory,'park-input.json');await write(input,{expectedVersion:status.version,waitMs:5000});
   const parked=await enterpriseTrafficUnderClaim(q.currentConfigFile,'parked',input);
   if(parked.mode!=='parked'||parked.drained!==true||parked.inFlight!==0)throw Error('upgrade_prepare_not_drained');
   return {mode:parked.mode,version:parked.version,drained:parked.drained,inFlight:parked.inFlight,instanceId:parked.instanceId??null};
  });
  await stage('backed_up',async()=>{
   backup=await backupEnterpriseUnderClaim(q.currentRoot,q.currentConfigFile);
   if(backup.stopped!==true||await readInstanceLock(currentConfig))throw Error('upgrade_prepare_old_instance_running');
   return {...backup,archiveSha256:sha(await readFile(backup.file)),recoveryKeySha256:sha(await readFile(backup.keyFile)),databaseInventory:await captureUpgradeDatabase(q.currentConfigFile)};
  });
  await stage('rehearsed',async()=>{
   const file=join(q.jobDirectory,'rehearsal-input.json');await write(file,{format:1,currentRoot:q.currentRoot,candidateRoot:q.candidateRoot,publicKeyFile:q.publicKeyFile,pinnedFingerprint:q.pinnedFingerprint,archiveFile:backup.file,recoveryKeyFile:backup.keyFile,shadowConfigFile:shadowConfig});
   rehearsal=await rehearseUpgrade(file,join(q.jobDirectory,'rehearsal.json'));
   if(rehearsal.status!=='SHADOW_SQL_REHEARSAL_VERIFIED'||rehearsal.originalArchiveUnchanged!==true||rehearsal.recoveryKeyUnchanged!==true)throw Error('upgrade_prepare_rehearsal_invalid');
   return {status:rehearsal.status,enterpriseId:rehearsal.enterpriseId,deploymentId:rehearsal.deploymentId,previousSchema:rehearsal.migration.previousSchemaFiles,candidateSchema:rehearsal.migration.candidateSchemaFiles,originalRows:rehearsal.migration.originalRows,tables:rehearsal.migration.existingTables.length,reportSha256:sha(await readFile(join(q.jobDirectory,'rehearsal.json')))};
  });
  await stage('candidate_ready',async()=>{
   const config=await readDeployment(shadowConfig);
   if(config.enterpriseId!==currentConfig.enterpriseId||config.deploymentId!==currentConfig.deploymentId||config.port!==currentConfig.port||config.origin!==currentConfig.origin||config.toolInstallationFile)throw Error('upgrade_prepare_candidate_identity_mismatch');
   let candidateInventory;await withDeploymentOperation(config,'backup',async()=>{
    await verifyTree(q.candidateRoot,q.publicKeyFile,q.pinnedFingerprint);
    const db=await openDatabase(join(config.stateDirectory,'database'));
    try{if(Number((await db.query('SELECT count(*) n FROM planning_model_installation')).rows[0].n)||Number((await db.query('SELECT count(*) n FROM process_graph_supervision WHERE enabled')).rows[0].n))throw Error('upgrade_prepare_external_authority_present');}finally{await db.close();}
    const service=await import(pathToFileURL(join(q.candidateRoot,'src/enterprise/service.ts')).href);
    if(typeof service.startEnterpriseUnderClaim!=='function')throw Error('upgrade_prepare_candidate_control_unavailable');
    try{
     application=await service.startEnterpriseUnderClaim(q.candidateRoot,shadowConfig);
     const status=await service.enterpriseStatus(shadowConfig);
     if(application.alreadyRunning||status.status!=='ready'||status.schema!==preflight.candidate.schemaFiles||status.schemaState!=='current'||status.traffic?.mode!=='parked'||status.traffic.inFlight!==0)throw Error('upgrade_prepare_candidate_not_parked_ready');
    }finally{if(application&&!application.alreadyRunning){await application.close();application=undefined;}}
    if(await readInstanceLock(config))throw Error('upgrade_prepare_candidate_not_stopped');
    candidateInventory=await captureUpgradeDatabase(shadowConfig);
   });
   return {schema:preflight.candidate.schemaFiles,configurationSha256:hash(config),databaseInventory:candidateInventory,instanceStartedAndStopped:true,mode:'parked',externalToolInstallationAbsent:true,modelInstallationAbsent:true,supervisionDisabled:true};
  });
 });
 return {...inspectUpgradeControl(state),configuration:shadowConfig,jobDirectory:q.jobDirectory,currentStopped:true,candidateStopped:true,cutoverPerformed:false,activationPerformed:false,modelCalls:0,sourceCalls:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--input')throw Error('upgrade_prepare_usage_invalid');const result=await prepareEnterpriseUpgrade(args[1]);console.log(JSON.stringify(result));}
 catch(e){console.error(JSON.stringify({code:/^upgrade_[a-z_]{1,100}$/.test(e?.message??'')?e.message:'upgrade_prepare_failed'}));process.exitCode=1;}
}
