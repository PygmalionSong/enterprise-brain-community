// Restore an old rollback point into NEW private storage, then rehearse signed SQL only.
// 将旧回滚点恢复到全新私人目录，只演练已验候选SQL，不启动候选应用。
import {readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {z} from 'zod';
import {preflightUpgrade} from './upgrade-preflight.mjs';
import {verifyTree} from './release.mjs';
import {readDeployment} from '../src/enterprise/configuration.ts';
import {openDatabase} from '../src/db/adapter.ts';
import {rehearseMigrations} from '../src/db/migration-rehearsal.ts';

const exec=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const schema=z.object({format:z.literal(1),currentRoot:z.string(),candidateRoot:z.string(),publicKeyFile:z.string(),pinnedFingerprint:z.string().regex(/^[a-f0-9]{64}$/),archiveFile:z.string(),recoveryKeyFile:z.string(),shadowConfigFile:z.string()}).strict();
const inside=(root,file)=>{const rel=relative(root,file);return rel===''||(!rel.startsWith('..')&&!isAbsolute(rel));};
async function absolute(file){if(!isAbsolute(file)||resolve(file)!==file)throw Error('rehearsal_absolute_path_required');}
async function regular(file,max){await absolute(file);const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max||(await realpath(file)).toLowerCase()!==file.toLowerCase())throw Error('rehearsal_private_file_invalid');const bytes=await readFile(file);if(bytes.length>max)throw Error('rehearsal_private_file_invalid');return bytes;}
async function absent(file){try{await lstat(file);}catch(e){if(e.code==='ENOENT')return;throw e;}throw Error('rehearsal_target_exists');}
async function directDirectory(file){await absolute(file);const stat=await lstat(file);if(!stat.isDirectory()||stat.isSymbolicLink()||(await realpath(file)).toLowerCase()!==file.toLowerCase())throw Error('rehearsal_private_path_indirect');}
function parse(bytes){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('rehearsal_json_invalid');}}
export async function rehearseUpgrade(inputFile,outputFile){
 if(process.versions.node!=='24.19.0'||process.platform!=='win32'||process.arch!=='x64')throw Error('rehearsal_host_profile_unverified');
 const input=schema.parse(parse(await regular(inputFile,16384)));await absolute(outputFile);await directDirectory(dirname(outputFile));await absent(outputFile);await absent(outputFile+'.preflight.json');await absent(outputFile+'.preflight-input.json');
 for(const file of [input.currentRoot,input.candidateRoot,input.publicKeyFile,input.archiveFile,input.recoveryKeyFile,input.shadowConfigFile])await absolute(file);
 for(const root of [input.currentRoot,input.candidateRoot])for(const file of [inputFile,outputFile,input.publicKeyFile,input.archiveFile,input.recoveryKeyFile,input.shadowConfigFile])if(inside(root,file))throw Error('rehearsal_private_path_inside_installation');
 const shadow=dirname(input.shadowConfigFile);await absent(shadow);await directDirectory(dirname(shadow));for(const file of [inputFile,outputFile,input.publicKeyFile,input.archiveFile,input.recoveryKeyFile])if(inside(shadow,file))throw Error('rehearsal_private_path_overlap');
 const archiveBefore=sha(await regular(input.archiveFile,256*1024*1024)),key=await regular(input.recoveryKeyFile,32);if(key.length!==32)throw Error('rehearsal_recovery_key_invalid');const keyBefore=sha(key);
 const preflightInput=outputFile+'.preflight-input.json',preflightOutput=outputFile+'.preflight.json';await writeFile(preflightInput,JSON.stringify({format:1,currentRoot:input.currentRoot,candidateRoot:input.candidateRoot,publicKeyFile:input.publicKeyFile,pinnedFingerprint:input.pinnedFingerprint}),{flag:'wx',mode:0o600});
 const journal={format:'enterprise-brain.shadow-rehearsal/1',id:randomUUID(),createdAt:new Date().toISOString(),status:'IN_PROGRESS',stage:'preflight',shadowConfiguration:input.shadowConfigFile,preflightReport:preflightOutput,originalArchiveSha256:archiveBefore,candidateApplicationExecuted:false,servicesStarted:false,canCutover:false,productionReady:false};await writeFile(outputFile,JSON.stringify(journal,null,2),{flag:'wx',mode:0o600});
 try{
  const preflight=await preflightUpgrade(preflightInput,preflightOutput);journal.stage='restore';await writeFile(outputFile,JSON.stringify(journal,null,2));
  // Execute the authenticated PRIOR restorer with the trusted current Node, never candidate JS.
  // 用受信当前Node执行已验旧版恢复器，绝不执行候选JS。
  await verifyTree(input.currentRoot,input.publicKeyFile,input.pinnedFingerprint);
  let restored;try{restored=await exec(process.execPath,[join(input.currentRoot,'scripts/enterprise.mjs'),'restore','--config',input.shadowConfigFile,'--archive',input.archiveFile,'--key',input.recoveryKeyFile],{cwd:input.currentRoot,windowsHide:true,timeout:60000,maxBuffer:65536,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:'',DATABASE_URL:'',EB_MODE:'enterprise'}});}catch(e){let code;try{code=JSON.parse(String(e.stderr??'').trim().split(/\r?\n/).at(-1)).code;}catch{}throw Error(/^enterprise_[a-z_]+$/.test(code??'')?code:'rehearsal_prior_restore_failed');}const restoration=parse(Buffer.from(restored.stdout.trim().split(/\r?\n/).at(-1)));
  if(restoration.restored!==true||restoration.sessionsInvalidated!==true||restoration.started!==false)throw Error('rehearsal_restore_contract_mismatch');
  await verifyTree(input.candidateRoot,input.publicKeyFile,input.pinnedFingerprint);journal.stage='shadow_sql';await writeFile(outputFile,JSON.stringify(journal,null,2));
  const config=await readDeployment(input.shadowConfigFile),db=await openDatabase(join(config.stateDirectory,'database'));let migration;
  try{if((await db.query('SELECT * FROM auth_session WHERE revoked_at IS NULL')).rows.length)throw Error('rehearsal_old_session_active');migration=await rehearseMigrations(db,join(input.candidateRoot,'migrations'),preflight.current.schemaFiles);}finally{await db.close();}
  if(sha(await regular(input.archiveFile,256*1024*1024))!==archiveBefore||sha(await regular(input.recoveryKeyFile,32))!==keyBefore)throw Error('rehearsal_original_backup_changed');
  const report={...journal,status:'SHADOW_SQL_REHEARSAL_VERIFIED',stage:'complete',restoredFiles:restoration.files,enterpriseId:restoration.enterpriseId,deploymentId:restoration.deploymentId,migration,originalArchiveUnchanged:true,recoveryKeyUnchanged:true,oldSessionsInvalidated:true,servicesStarted:false,modelsCalled:0,cutoverPerformed:false,rollbackProven:false,semanticCompatibilityProven:false};await writeFile(outputFile,JSON.stringify(report,null,2)+'\n');return report;
 }catch(e){const code=/^(rehearsal|upgrade|release|enterprise)_[a-z_]+$/.test(e?.message??'')?e.message:'rehearsal_stage_failed';await writeFile(outputFile,JSON.stringify({...journal,status:'SHADOW_REHEARSAL_FAILED',code,failedMigrationId:/^\d{3}_[a-z0-9_]+\.sql$/.test(e?.migrationId??'')?e.migrationId:null,sqlState:/^[0-9A-Z]{5}$/.test(e?.sqlState??'')?e.sqlState:null,partialShadowMigration:e?.partialShadowMigration===true,shadowRetainedForDiagnosis:true,originalDirectoriesDeleted:false},null,2)+'\n');throw Error(code);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--input'||args[2]!=='--out')throw Error('rehearsal_usage_invalid');const result=await rehearseUpgrade(args[1],args[3]);console.log(JSON.stringify({status:result.status,existingTables:result.migration.existingTables.length,appliedMigrations:result.migration.appliedMigrations.length,candidateApplicationExecuted:false,canCutover:false}));}
 catch(e){console.error(JSON.stringify({code:/^rehearsal_[a-z_]+$/.test(e?.message??'')?e.message:'rehearsal_failed'}));process.exitCode=1;}
}
