// Commit one verified fresh candidate; a committed deployment is never automatically rolled back.
// 提交一个经验证且未过时的候选；提交之后绝不自动回退旧数据库。
import {readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {resolve,join,isAbsolute} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {verifyTree} from './release.mjs';
import {upgradePreparationInputSchema} from './prepare-enterprise-upgrade.mjs';
import {readPrivateJson,readDeployment} from '../src/enterprise/configuration.ts';
import {withDeploymentOperation} from '../src/enterprise/operation-guard.ts';
import {enterpriseTrafficUnderClaim} from '../src/enterprise/traffic-operations.ts';
import {captureUpgradeDatabase} from '../src/enterprise/upgrade-inventory.ts';
import {readUpgradeControl,updateUpgradeControl,inspectUpgradeControl} from '../src/enterprise/upgrade-control.ts';
import {hash} from '../src/runtime/contracts.ts';
const sha=v=>createHash('sha256').update(v).digest('hex'),shaSchema=z.string().regex(/^[a-f0-9]{64}$/);
const jobSchema=z.object({format:z.literal(1),jobDirectory:z.string()}).strict();
const commitSchema=z.object({format:z.literal(1),jobDirectory:z.string(),expectedVersion:z.number().int().positive().max(1000),expectedBindingSha256:shaSchema,activationAcknowledged:z.literal(true)}).strict();
async function job(directory){
 if(!isAbsolute(directory)||resolve(directory)!==directory)throw Error('upgrade_managed_absolute_path_required');const stat=await lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||(await realpath(directory)).toLowerCase()!==directory.toLowerCase())throw Error('upgrade_managed_path_indirect');
 const file=join(directory,'control.json'),state=await readUpgradeControl(file),plan=upgradePreparationInputSchema.parse(await readPrivateJson(join(directory,'plan.json')));
 if(plan.jobDirectory!==directory||hash(plan)!==state.binding.planSha256||plan.pinnedFingerprint!==state.binding.publisherFingerprint)throw Error('upgrade_managed_plan_changed');
 const receipts={};
 for(const event of state.events){
  if(event.outcome!=='completed')continue;const path=join(directory,event.targetStage+'.receipt.json'),info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>131072)throw Error('upgrade_managed_evidence_changed');const bytes=await readFile(path);
  if(bytes.length>131072||sha(bytes)!==event.evidenceSha256)throw Error('upgrade_managed_evidence_changed');
  const r=await readPrivateJson(path,131072);
  if(r.format!==1||r.upgradeId!==state.id||r.operationId!==event.operationId||r.bindingSha256!==state.bindingSha256||r.target!==event.targetStage||!r.receipt||typeof r.receipt!=='object')throw Error('upgrade_managed_evidence_changed');receipts[event.targetStage]=r.receipt;
 }
 return {file,state,plan,receipts,directory};
}
async function verifyInstallation(root,publicKey,pin,expected){await verifyTree(root,publicKey,pin);const release=await readPrivateJson(join(root,'RELEASE.json'),2*1024*1024);if(sha(release.manifestText)!==expected)throw Error('upgrade_managed_installation_changed');}
async function privateBinaryHash(file,max){if(!isAbsolute(file)||resolve(file)!==file)throw Error('upgrade_managed_backup_changed');const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>max||(await realpath(file)).toLowerCase()!==file.toLowerCase())throw Error('upgrade_managed_backup_changed');const bytes=await readFile(file);if(bytes.length>max)throw Error('upgrade_managed_backup_changed');return sha(bytes);}
async function write(file,value){const bytes=JSON.stringify(value,null,2)+'\n';if(Buffer.byteLength(bytes)>131072)throw Error('upgrade_managed_evidence_limit');await writeFile(file,bytes,{flag:'wx',mode:0o600});return sha(bytes);}
async function compatibleConfiguration(context){const config=await readDeployment(join(context.directory,'candidate/config.json'));if(config.enterpriseId!==context.state.binding.enterpriseId||config.deploymentId!==context.state.binding.deploymentId)throw Error('upgrade_managed_configuration_changed');return config;}
export async function commitEnterpriseUpgrade(inputFile){
 if(process.platform!=='win32'||process.arch!=='x64'||process.versions.node!=='24.19.0')throw Error('upgrade_managed_host_unverified');
 const q=commitSchema.parse(await readPrivateJson(inputFile)),context=await job(q.jobDirectory),{plan,receipts,file}=context;let state=context.state,application,successful=false,service;
 if(state.pending)throw Error('upgrade_needs_inspection');
 if(state.stage!=='candidate_ready'||state.activeInstallation!=='current')throw Error('upgrade_managed_not_prepared');
 if(state.version!==q.expectedVersion||state.bindingSha256!==q.expectedBindingSha256)throw Error('upgrade_control_conflict');
 if(!receipts.quiesced||!receipts.backed_up?.databaseInventory||!receipts.rehearsed||!receipts.candidate_ready?.databaseInventory)throw Error('upgrade_managed_preparation_incomplete');
 await verifyInstallation(plan.currentRoot,plan.publicKeyFile,plan.pinnedFingerprint,state.binding.currentManifestSha256);
 await verifyInstallation(plan.candidateRoot,plan.publicKeyFile,plan.pinnedFingerprint,state.binding.candidateManifestSha256);
 const old=await readDeployment(plan.currentConfigFile),candidate=await compatibleConfiguration(context),candidateFile=join(context.directory,'candidate/config.json');
 if(hash(old)!==state.binding.configurationSha256||hash(candidate)!==receipts.candidate_ready.configurationSha256)throw Error('upgrade_managed_configuration_changed');
 async function stage(target,run){
  const operationId=randomUUID(),intentSha256=hash({upgradeId:state.id,bindingSha256:state.bindingSha256,target,priorEvidenceSha256:state.events.at(-1)?.evidenceSha256});
  state=await updateUpgradeControl(file,{action:'begin',expectedVersion:state.version,operationId,targetStage:target,intentSha256});
  let receipt;try{receipt=await run();}catch(e){const code=target==='active'?'upgrade_activation_failed':'upgrade_candidate_commit_failed';state=await updateUpgradeControl(file,{action:'fail',expectedVersion:state.version,operationId,code});throw Error(code);}
  const evidenceSha256=await write(join(context.directory,target+'.receipt.json'),{format:1,upgradeId:state.id,operationId,bindingSha256:state.bindingSha256,target,receipt});
  state=await updateUpgradeControl(file,{action:'complete',expectedVersion:state.version,operationId,evidenceSha256});
 }
 await withDeploymentOperation(old,'backup',()=>withDeploymentOperation(candidate,'backup',async()=>{
  // Opening either embedded database can change its files. Compare the offline preparation
  // before startup, while both maintenance claims are held.
  // 打开嵌入库可能改变文件；持有双方互斥声明，在启动之前核对离线准备点。
  if(hash(await captureUpgradeDatabase(plan.currentConfigFile))!==hash(receipts.backed_up.databaseInventory))throw Error('upgrade_managed_old_state_changed');
  if(hash(await captureUpgradeDatabase(candidateFile))!==hash(receipts.candidate_ready.databaseInventory))throw Error('upgrade_managed_candidate_state_changed');
  const traffic=await enterpriseTrafficUnderClaim(plan.currentConfigFile,'status'),newTraffic=await enterpriseTrafficUnderClaim(candidateFile,'status');
  if(traffic.running||traffic.mode!=='parked'||traffic.version!==receipts.quiesced.version||newTraffic.running||newTraffic.mode!=='parked')throw Error('upgrade_managed_traffic_changed');
  if(await privateBinaryHash(receipts.backed_up.file,256*1024*1024)!==receipts.backed_up.archiveSha256||await privateBinaryHash(receipts.backed_up.keyFile,32)!==receipts.backed_up.recoveryKeySha256)throw Error('upgrade_managed_backup_changed');
  try{
   await stage('committed_parked',async()=>{
    await verifyInstallation(plan.candidateRoot,plan.publicKeyFile,plan.pinnedFingerprint,state.binding.candidateManifestSha256);
    service=await import(pathToFileURL(join(plan.candidateRoot,'src/enterprise/service.ts')).href);
    if(typeof service.startEnterpriseUnderClaim!=='function')throw Error('upgrade_managed_candidate_control_unavailable');
    application=await service.startEnterpriseUnderClaim(plan.candidateRoot,candidateFile);
    const health=await service.enterpriseStatus(candidateFile);
    if(application.alreadyRunning||health.status!=='ready'||health.schema!==receipts.candidate_ready.schema||health.schemaState!=='current'||health.traffic?.mode!=='parked'||health.traffic.inFlight!==0)throw Error('upgrade_managed_candidate_not_parked');
    return {configurationSha256:hash(candidate),enterpriseId:candidate.enterpriseId,deploymentId:candidate.deploymentId,origin:candidate.origin,port:candidate.port,schema:health.schema,instanceId:health.instanceId,mode:'parked'};
   });
   // The atomic control-file update above commits the pointer BEFORE opening admission.
   // 上一步原子更新控制档已先提交指针，之后才打开业务受理。
   await stage('active',async()=>{
    const status=await enterpriseTrafficUnderClaim(candidateFile,'status'),input=join(context.directory,'activation-input.json');await write(input,{expectedVersion:status.version,waitMs:5000});
    const active=await enterpriseTrafficUnderClaim(candidateFile,'active',input);
    if(active.mode!=='active'||active.drained!==true||active.inFlight!==0)throw Error('upgrade_managed_activation_failed');
    return {instanceId:active.instanceId,mode:active.mode,version:active.version,configurationSha256:hash(candidate)};
   });
   successful=true;
  }finally{
   if(!successful&&application&&!application.alreadyRunning){
    // Preserve the committed candidate and stop accepting; never restore the old snapshot.
    // 保全已提交候选并停止受理，绝不自动恢复旧快照。
    try{const status=await enterpriseTrafficUnderClaim(candidateFile,'status'),input=join(context.directory,'failed-park-input.json');await write(input,{expectedVersion:status.version,waitMs:5000});await enterpriseTrafficUnderClaim(candidateFile,'parked',input);}finally{await application.close();}
   }
  }
 }));
 return {...inspectUpgradeControl(state),configuration:candidateFile,cutoverPerformed:true,activationPerformed:true,oldInstanceStarted:false,automaticRollbackAllowed:false,close:application.close};
}
export async function managedEnterpriseOperation(action,inputFile){
 const q=jobSchema.parse(await readPrivateJson(inputFile)),context=await job(q.jobDirectory),{state,plan,receipts}=context;
 if(action==='inspect')return inspectUpgradeControl(state);
 if(!['start','status','stop'].includes(action))throw Error('upgrade_managed_action_invalid');
 if(state.pending)throw Error('upgrade_needs_inspection');
 if(state.activeInstallation!=='candidate'||action==='start'&&state.stage!=='active')throw Error('upgrade_managed_not_active');
 await verifyInstallation(plan.candidateRoot,plan.publicKeyFile,plan.pinnedFingerprint,state.binding.candidateManifestSha256);
 const config=await compatibleConfiguration(context),committed=receipts.committed_parked;
 if(!committed||config.origin!==committed.origin||config.port!==committed.port)throw Error('upgrade_managed_configuration_changed');
 const configFile=join(context.directory,'candidate/config.json'),service=await import(pathToFileURL(join(plan.candidateRoot,'src/enterprise/service.ts')).href);
 if(action==='status')return {...inspectUpgradeControl(state),instance:await service.enterpriseStatus(configFile)};
 if(action==='stop')return {...inspectUpgradeControl(state),instance:await service.stopEnterprise(configFile)};
 const application=await service.startEnterprise(plan.candidateRoot,configFile);return {...inspectUpgradeControl(state),instance:application.status,close:application.alreadyRunning?undefined:application.close};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2),action=args[0];if(args.length!==3||args[1]!=='--input'||!['commit','inspect','start','status','stop'].includes(action))throw Error('upgrade_managed_usage_invalid');const result=action==='commit'?await commitEnterpriseUpgrade(args[2]):await managedEnterpriseOperation(action,args[2]);if(result.close){const close=()=>void result.close().catch(()=>{process.exitCode=1;});process.once('SIGINT',close);process.once('SIGTERM',close);}const {close,...safe}=result;console.log(JSON.stringify(safe));}
 catch(e){console.error(JSON.stringify({code:/^(?:upgrade|enterprise)_[a-z_]{1,100}$/.test(e?.message??'')?e.message:'upgrade_managed_failed'}));process.exitCode=1;}
}
