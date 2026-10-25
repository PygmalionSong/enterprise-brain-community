// Explicit read-only runtime review after offline signature qualification; never acquires ownership.
// 离线签名资格后的显式只读运行核对，不接管归属。
import {readFile,lstat,realpath,open} from 'node:fs/promises';import {dirname,join,isAbsolute,resolve} from 'node:path';
import {createHash} from 'node:crypto';import {z} from 'zod';
import {inspectNativeUpgradePlan,nativeUpgradePlanInputSchema} from './native-upgrade-plan.ts';
import {nativeRuntimeDescriptorSchema,connectNativeRuntime,isVerifiedNativeRuntimeConnection} from '../db/native-runtime-connection.ts';
import {inspectNativeRuntime} from '../db/native-runtime-preflight.ts';import {readSchemaInventory} from '../db/schema-health.ts';
import {readNativeDeployment} from './native-configuration.ts';import type {Database} from '../db/adapter.ts';
const absolute=z.string().max(1024).refine(v=>isAbsolute(v)&&resolve(v)===v),sha=z.string().regex(/^[a-f0-9]{64}$/),hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
export const nativeUpgradeRuntimeReviewSchema=z.object({format:z.literal('enterprise-brain.native-upgrade-runtime-review-input/1'),planningInputFile:absolute,planFile:absolute,expectedPlanSha256:sha,runtimeReviewAcknowledged:z.literal(true)}).strict();
async function bounded(file:string,max:number){absolute.parse(file);const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size<1||s.size>max||(await realpath(dirname(file))).toLowerCase()!==dirname(file).toLowerCase())throw Error('native_upgrade_review_private_file_invalid');const b=await readFile(file);if(b.length<1||b.length>max)throw Error('native_upgrade_review_input_limit');return b;}
const json=(b:Buffer)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
function fixed(value:Awaited<ReturnType<typeof inspectNativeUpgradePlan>>){const {createdAt,static:staticValue,...rest}=value,{createdAt:staticTime,...staticFixed}=staticValue;return {...rest,static:staticFixed};}
export async function reviewNativeUpgradeRuntime(inputFile:string,outputFile:string){
 const inputBytes=await bounded(inputFile,16384),q=nativeUpgradeRuntimeReviewSchema.parse(json(inputBytes)),planBytes=await bounded(q.planFile,8*1024*1024);if(hash(planBytes)!==q.expectedPlanSha256)throw Error('native_upgrade_review_plan_changed');
 const plan=json(planBytes),actual=await inspectNativeUpgradePlan(q.planningInputFile,outputFile);
 if(JSON.stringify(fixed(plan))!==JSON.stringify(fixed(actual)))throw Error('native_upgrade_review_plan_invalid');
 const planningBytes=await bounded(q.planningInputFile,16384);if(hash(planningBytes)!==actual.binding.inputSha256)throw Error('native_upgrade_review_input_changed');
 const p=nativeUpgradePlanInputSchema.parse(json(planningBytes));
 // Apply the same outside-installation/report rule to every private review input.
 // 所有私人核对输入都保持与离线阶段相同的安装目录隔离。
 const {relative}=await import('node:path');const inside=(root:string,f:string)=>{const r=relative(root.toLowerCase(),f.toLowerCase());return r===''||!r.startsWith('..')&&!isAbsolute(r);};
 for(const root of [p.currentRoot,p.candidateRoot])for(const file of [inputFile,q.planFile])if(inside(root,file)||inside(file,root))throw Error('native_upgrade_review_private_path_overlap');
 if([inputFile,q.planFile,q.planningInputFile,p.publicKeyFile].includes(outputFile))throw Error('native_upgrade_review_output_overlap');
 const config=await readNativeDeployment(p.currentConfigFile);if(hash(await bounded(p.currentConfigFile,16384))!==actual.binding.configurationSha256)throw Error('native_upgrade_review_configuration_changed');
 const descriptor=nativeRuntimeDescriptorSchema.parse(json(await bounded(config.runtimeDescriptorFile,16384)));if(descriptor.tls.mode!=='verify-full')throw Error('native_upgrade_review_tls_required');
 const credentialFiles=[descriptor.passwordFile,descriptor.tls.caFile],credentialBytes=await Promise.all(credentialFiles.map((f,i)=>bounded(f,i?65536:512))),credentialSha256=hash(JSON.stringify(credentialFiles.map((file,i)=>({file,sha256:hash(credentialBytes[i])}))));
 const expectedMigrations=await readSchemaInventory(join(p.currentRoot,'migrations')),connection=await connectNativeRuntime(config.runtimeDescriptorFile,expectedMigrations,config.runtimeDescriptorSha256);
 let databaseReview;
 try{
  const db=connection.database;if(!isVerifiedNativeRuntimeConnection(db,config.enterpriseId,config.runtimeRole,config.runtimeDescriptorSha256))throw Error('native_upgrade_review_scope_mismatch');
  databaseReview=await db.transaction(async tx=>{
   await tx.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='3000'; SET LOCAL lock_timeout='1000'");
   const snapshot:Database={profile:'postgres',query:tx.query,exec:tx.exec,transaction:fn=>fn(tx),close:async()=>{throw Error('native_upgrade_review_close_forbidden');}};
   const qualification=await inspectNativeRuntime(snapshot,{enterpriseId:config.enterpriseId,runtimeRole:config.runtimeRole,expectedMigrations});if(!qualification.prerequisitesMet)throw Error('native_upgrade_review_runtime_unqualified');
   const target=(await tx.query("SELECT d.oid::text oid,current_database() name,current_user role,inet_server_addr()::text address,inet_server_port() port,current_setting('server_version_num') version,current_setting('transaction_read_only')='on' readonly,current_setting('transaction_isolation')='repeatable read' snapshot FROM pg_catalog.pg_database d WHERE datname=current_database()")).rows;
   if(target.length!==1||target[0].readonly!==true||target[0].snapshot!==true)throw Error('native_upgrade_review_snapshot_unavailable');
   const authority=(await tx.query("SELECT jsonb_build_object('database',(SELECT jsonb_build_array(datdba::text,datallowconn,datconnlimit,datacl::text) FROM pg_catalog.pg_database WHERE datname=current_database()),'roles',(SELECT jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolconnlimit,rolvaliduntil,rolbypassrls,rolconfig) ORDER BY rolname COLLATE \"C\") FROM pg_catalog.pg_roles WHERE rolname IN (current_user,'eb_app')),'membership',(SELECT COALESCE(jsonb_agg(jsonb_build_array(roleid::text,member::text,grantor::text,admin_option,inherit_option,set_option) ORDER BY roleid,member,grantor),'[]'::jsonb) FROM pg_catalog.pg_auth_members WHERE member IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN (current_user,'eb_app'))))::text value")).rows[0]?.value;
   if(typeof authority!=='string'||Buffer.byteLength(authority)>65536)throw Error('native_upgrade_review_authority_unavailable');
   return {currentSchema:expectedMigrations.length,migrationSha256:hash(JSON.stringify(expectedMigrations)),targetObservationSha256:hash(JSON.stringify(target[0])),authorityObservationSha256:hash(authority),qualificationPassed:true,readOnlyRepeatableRead:true,clusterSystemIdentifierChecked:false,fullDatabaseInventoryCaptured:false,businessRowsRead:false};
  });
 }finally{await connection.database.close();}
 const final=await inspectNativeUpgradePlan(q.planningInputFile,outputFile);if(JSON.stringify(fixed(actual))!==JSON.stringify(fixed(final))||!(await bounded(inputFile,16384)).equals(inputBytes)||!(await bounded(q.planFile,8*1024*1024)).equals(planBytes))throw Error('native_upgrade_review_plan_changed');
 for(let i=0;i<credentialFiles.length;i++)if(!(await bounded(credentialFiles[i],i?65536:512)).equals(credentialBytes[i]))throw Error('native_upgrade_review_credentials_changed');
 const report={format:'enterprise-brain.native-upgrade-runtime-review/1',createdAt:new Date().toISOString(),status:'NATIVE_RUNTIME_REVIEWED_REHEARSAL_AND_BACKUP_REQUIRED',binding:{...actual.binding,planSha256:q.expectedPlanSha256,reviewInputSha256:hash(inputBytes),runtimeCredentialsSha256:credentialSha256},databaseReview,scope:{runtimeCredentialsRead:true,privilegedConnectionOpened:false,candidateExecuted:false,databaseModified:false,ownershipAcquired:false,serviceChanged:false,backupCreated:false,rehearsalPassed:false,canMigrate:false,canCutover:false,productionReady:false},next:'Fresh owned online backup,explicit isolated shadow target,privileged complete inventory/authority proof and durable commit/completion are still required'};
 const text=JSON.stringify(report,null,2)+'\n',handle=await open(outputFile,'wx',0o600);try{await handle.writeFile(text);await handle.sync();}finally{await handle.close();}return report;
}
