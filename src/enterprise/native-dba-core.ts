// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
import{canonicalPathEqual}from'../platform/canonical-path.ts';
// Internal DBA initialization; no HTTP/CLI activation until durable recovery is wired.
// 内部DBA初始化；持久恢复接入前不向HTTP或CLI开放。
import {readFile,lstat,realpath} from 'node:fs/promises';
import {isAbsolute,resolve,dirname,join} from 'node:path';
import {createHash,X509Certificate} from 'node:crypto';
import pg from 'pg';import {z} from 'zod';
import type {Database} from '../db/adapter.ts';import {migrate} from '../db/migrate.ts';
import {readSchemaInventory} from '../db/schema-health.ts';
import {nativeRuntimeDescriptorSchema,connectNativeRuntime} from '../db/native-runtime-connection.ts';
import {IdentityService} from '../identity/service.ts';import {OperatorDirectory} from '../identity/operators.ts';
import {initializationSchema,freshSecret} from './configuration.ts';
import {nativeHostGrants,createNativeEnterpriseApplication} from '../http/enterprise.ts';
import {readNativeDatabaseInventoryCore,type NativeDatabaseInventory} from './native-database-inventory-core.ts';
// Shared absence policy; initialization behavior is unchanged. / 共用缺席策略，初始化行为不变。
export {preparationCatalogueEmpty};
const sha=z.string().regex(/^[a-f0-9]{64}$/),absolute=z.string().max(1024).refine(v=>isAbsolute(v)&&resolve(v)===v);
const dbaDescriptor=z.object({...nativeRuntimeDescriptorSchema.shape,purpose:z.literal('enterprise-brain.native-prepare'),dbaRole:z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),tls:z.object({mode:z.literal('verify-full'),caFile:absolute}).strict()}).strict();
export const nativePreparationInputSchema=initializationSchema.omit({toolInstallationFile:true}).extend({enterpriseId:z.uuid()}).strict();
const bindingSchema=z.object({operationId:z.uuid(),codeSha256:sha,dbaDescriptorFile:absolute,dbaDescriptorSha256:sha,runtimeDescriptorFile:absolute,runtimeDescriptorSha256:sha,initializationAcknowledged:z.literal(true),dedicatedDatabaseAcknowledged:z.literal(true),runtimeConnectGrantAcknowledged:z.literal(true)}).strict();
export type NativePreparationIntent=Readonly<{format:1;operationId:string;enterpriseId:string;codeSha256:string;migrationSha256:string;targetSha256:string;authoritySha256:string;inventory:NativeDatabaseInventory}>;
export const nativePreparationIntentSchema=z.object({format:z.literal(1),operationId:z.uuid(),enterpriseId:z.uuid(),codeSha256:sha,migrationSha256:sha,targetSha256:sha,authoritySha256:sha,inventory:z.object({format:z.literal(1),tableCount:z.number().int().min(1).max(10000),sequenceCount:z.number().int().min(0).max(10000),rows:z.number().int().min(0).max(1000000),dataSha256:sha,catalogueSha256:sha,catalogueObjects:z.number().int().min(1).max(10000)}).strict()}).strict();
const hash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
async function privateBytes(file:string,max:number){absolute.parse(file);const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>max||!canonicalPathEqual((await realpath(dirname(file))),dirname(file)))throw Error('native_prepare_private_file_invalid');const b=await readFile(file);if(b.length<1||b.length>max)throw Error('native_prepare_private_file_invalid');return b;}
function caBundle(b:Buffer){const text=new TextDecoder('utf-8',{fatal:true}).decode(b),certs=text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);if(!certs?.length||certs.length>8||text.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,'').trim())throw Error('native_prepare_ca_invalid');for(const c of certs)new X509Certificate(c);return text;}
async function descriptor<T>(file:string,expected:string,schema:z.ZodType<T>){sha.parse(expected);const b=await privateBytes(file,16384);if(hash(b)!==expected)throw Error('native_prepare_descriptor_changed');return schema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b)));}
function secret(b:Buffer){const value=new TextDecoder('utf-8',{fatal:true}).decode(b);if(!value||/[\x00-\x1f\x7f]/.test(value))throw Error('native_prepare_password_invalid');return value;}
const barrier=`SELECT current_user=$1 AND session_user=$1 AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper AND rolcanlogin) actor_safe,
 EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND datallowconn AND NOT datistemplate AND datname NOT IN ('postgres','template0','template1') AND pg_get_userbyid(datdba)=$1) database_safe,
 EXISTS(SELECT 1 FROM pg_roles WHERE rolname=$2 AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication) runtime_safe,
 NOT EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=$2) no_memberships,
 NOT has_database_privilege($2,current_database(),'CONNECT,CREATE,TEMP') runtime_blocked,
 NOT EXISTS(SELECT 1 FROM pg_database d,LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a WHERE d.datname=current_database() AND a.privilege_type='CONNECT' AND a.grantee<>(SELECT oid FROM pg_roles WHERE rolname=$1)) acl_closed,
 NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolcanlogin AND NOT r.rolsuper AND r.rolname<>$1 AND has_database_privilege(r.oid,current_database(),'CONNECT')) ordinary_logins_blocked,
 NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) no_peers,
 NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='eb_app') app_absent,
 NOT EXISTS(SELECT 1 FROM pg_database WHERE NOT datistemplate AND datname NOT IN ('postgres',current_database())) dedicated_cluster,
 NOT EXISTS(SELECT 1 FROM pg_namespace n WHERE pg_get_userbyid(n.nspowner)=$2) AND NOT EXISTS(SELECT 1 FROM pg_class c WHERE pg_get_userbyid(c.relowner)=$2) AND NOT EXISTS(SELECT 1 FROM pg_proc p WHERE pg_get_userbyid(p.proowner)=$2) AND NOT EXISTS(SELECT 1 FROM pg_type t WHERE pg_get_userbyid(t.typowner)=$2) AND NOT EXISTS(SELECT 1 FROM pg_database d WHERE pg_get_userbyid(d.datdba)=$2) runtime_owns_nothing,
 NOT EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND has_schema_privilege($2,n.oid,'CREATE')) no_schema_create,
 EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='public' AND pg_get_userbyid(nspowner) IN (current_user,'pg_database_owner')) public_owned,
 current_setting('server_version_num')::integer BETWEEN 170000 AND 179999 version_safe,
 EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl) tls`;
// Unsupported nonrelation objects must remain absent before and after commit.
// 提交前后均须不存在未支持的非表对象。
const preparationCatalogueEmpty=`NOT EXISTS(SELECT 1 FROM pg_publication) AND NOT EXISTS(SELECT 1 FROM pg_subscription) AND NOT EXISTS(SELECT 1 FROM pg_default_acl) AND NOT EXISTS(SELECT 1 FROM pg_foreign_data_wrapper) AND NOT EXISTS(SELECT 1 FROM pg_transform) AND NOT EXISTS(SELECT 1 FROM pg_am WHERE amname NOT IN ('heap','btree','hash','gist','gin','spgist','brin')) AND NOT EXISTS(SELECT 1 FROM pg_collation c JOIN pg_namespace n ON n.oid=c.collnamespace WHERE n.nspname='public') AND NOT EXISTS(SELECT 1 FROM pg_conversion c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public') AND NOT EXISTS(SELECT 1 FROM pg_ts_config c JOIN pg_namespace n ON n.oid=c.cfgnamespace WHERE n.nspname='public') AND NOT EXISTS(SELECT 1 FROM pg_ts_dict c JOIN pg_namespace n ON n.oid=c.dictnamespace WHERE n.nspname='public') AND NOT EXISTS(SELECT 1 FROM pg_ts_parser c JOIN pg_namespace n ON n.oid=c.prsnamespace WHERE n.nspname='public') AND NOT EXISTS(SELECT 1 FROM pg_ts_template c JOIN pg_namespace n ON n.oid=c.tmplnamespace WHERE n.nspname='public')`;
const empty=`SELECT NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')) AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AND NOT EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') AND NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname<>'plpgsql') AND NOT EXISTS(SELECT 1 FROM pg_largeobject_metadata) AND NOT EXISTS(SELECT 1 FROM pg_foreign_server) AND NOT EXISTS(SELECT 1 FROM pg_event_trigger) AND (${preparationCatalogueEmpty}) empty`;
async function authority(client:pg.Client,runtimeRole:string){const q=(await client.query(`SELECT jsonb_build_object('database',(SELECT jsonb_build_array(datname,pg_get_userbyid(datdba),datallowconn,datconnlimit,datacl::text) FROM pg_database WHERE datname=current_database()),'roles',(SELECT jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolconnlimit,rolvaliduntil,rolbypassrls,rolconfig) ORDER BY rolname COLLATE "C") FROM pg_roles WHERE rolname IN ($1,'eb_app')),'membership',(SELECT COALESCE(jsonb_agg(jsonb_build_array(pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor),admin_option,inherit_option,set_option) ORDER BY roleid,member,grantor),'[]'::jsonb) FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ($1,'eb_app'))))::text value`,[runtimeRole])).rows[0]?.value;if(typeof q!=='string')throw Error('native_prepare_authority_unavailable');return hash(q);}

async function preparationContext(root:string,bindingInput:unknown,initializationInput:unknown){
 absolute.parse(root);const b=bindingSchema.parse(bindingInput),input=nativePreparationInputSchema.parse(initializationInput);
 if(Object.entries(process.env).some(([k,v])=>/^PG/i.test(k)&&v))throw Error('native_prepare_environment_conflict');
 const d=await descriptor(b.dbaDescriptorFile,b.dbaDescriptorSha256,dbaDescriptor),r=await descriptor(b.runtimeDescriptorFile,b.runtimeDescriptorSha256,nativeRuntimeDescriptorSchema);
 if(r.tls.mode!=='verify-full'||d.host!==r.host||d.port!==r.port||d.database!==r.database||d.enterpriseId!==r.enterpriseId||d.runtimeRole!==r.runtimeRole||d.enterpriseId!==input.enterpriseId||d.dbaRole===d.runtimeRole)throw Error('native_prepare_scope_mismatch');
 const files=[d.passwordFile,d.tls.caFile,r.passwordFile,r.tls.caFile],credentials=await Promise.all(files.map((f,i)=>privateBytes(f,i%2===0?512:65536))),fileHashes=credentials.map(hash);
 const password=secret(credentials[0]),runtimePassword=secret(credentials[2]),ca=caBundle(credentials[1]),runtimeCa=caBundle(credentials[3]);
 const assertFiles=async()=>{await descriptor(b.dbaDescriptorFile,b.dbaDescriptorSha256,dbaDescriptor);await descriptor(b.runtimeDescriptorFile,b.runtimeDescriptorSha256,nativeRuntimeDescriptorSchema);for(let i=0;i<files.length;i++)if(hash(await privateBytes(files[i],65536))!==fileHashes[i])throw Error('native_prepare_credentials_changed');};
 const migrations=await readSchemaInventory(join(root,'migrations')),migrationSha256=hash(JSON.stringify(migrations));
 const client=new pg.Client({host:d.host,port:d.port,database:d.database,user:d.dbaRole,password,ssl:{rejectUnauthorized:true,minVersion:'TLSv1.2',ca},application_name:'eb-prepare-owner:'+b.operationId,client_encoding:'UTF8',connectionTimeoutMillis:3000,query_timeout:15000,statement_timeout:10000,lock_timeout:1000,idle_in_transaction_session_timeout:15000,options:'-c search_path=pg_catalog,public -c row_security=on'});
 return {b,input,d,r,migrations,migrationSha256,client,assertFiles,runtimePassword,runtimeCa,credentialsSha256:hash(JSON.stringify(files.map((file,i)=>({file,sha256:fileHashes[i]}))))};
}
// Private hashes only; construction never opens a network connection.
// 仅私人摘要；构造上下文不建立网络连接。
export async function nativePreparationCredentialsSha256(root:string,bindingInput:unknown,initializationInput:unknown){return (await preparationContext(root,bindingInput,initializationInput)).credentialsSha256;}

// Completion only compares a previously durable COMMIT intent. It never migrates or grants.
// 完成操作仅核对预先持久化的提交意图，不重放迁移或授权。
export async function verifyNativePreparedDatabase(root:string,bindingInput:unknown,initializationInput:unknown,expectedInput:unknown){
 const expected=nativePreparationIntentSchema.parse(expectedInput),{b,input,d,migrations,migrationSha256,client,assertFiles}=await preparationContext(root,bindingInput,initializationInput);
 if(expected.operationId!==b.operationId||expected.enterpriseId!==input.enterpriseId||expected.codeSha256!==b.codeSha256||expected.migrationSha256!==migrationSha256)throw Error('native_prepare_intent_mismatch');
 let transaction=false;client.on('error',()=>{});
 try{await client.connect();if((await client.query('SELECT pg_try_advisory_lock(71245120,1) acquired')).rows[0]?.acquired!==true)throw Error('native_prepare_database_in_use');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');transaction=true;await assertFiles();
  const flags=(await client.query(`SELECT current_user=$1 AND session_user=$1 AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper AND rolcanlogin) actor,EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND NOT datistemplate AND datallowconn AND pg_get_userbyid(datdba)=$1) owned,NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) alone,EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl) tls,(${preparationCatalogueEmpty}) catalogue_empty`,[d.dbaRole])).rows[0];if(!flags||Object.values(flags).some(v=>v!==true))throw Error('native_prepare_completion_owner_unavailable');
  const cluster=(await client.query('SELECT system_identifier::text cluster FROM pg_control_system()')).rows[0]?.cluster,oid=(await client.query('SELECT oid::text oid FROM pg_database WHERE datname=current_database()')).rows[0]?.oid,target=hash(JSON.stringify({host:d.host,port:d.port,database:d.database,cluster,oid}));
  const event=(await client.query('SELECT enterprise_id,kind,details FROM public.audit_event WHERE id=$1',[b.operationId])).rows;
  const details=event[0]?.details;if(target!==expected.targetSha256||event.length!==1||event[0].enterprise_id!==input.enterpriseId||event[0].kind!=='native_enterprise_prepared'||!details||Object.keys(details).length!==4||details.operationId!==b.operationId||details.codeSha256!==b.codeSha256||details.migrationSha256!==migrationSha256||details.targetSha256!==target)throw Error('native_prepare_completion_audit_mismatch');
  const actual=await readNativeDatabaseInventoryCore(client,1000000);if(JSON.stringify(actual)!==JSON.stringify(expected.inventory)||await authority(client,d.runtimeRole)!==expected.authoritySha256)throw Error('native_prepare_completion_contents_changed');
  await assertFiles();await client.query('COMMIT');transaction=false;await client.query('SELECT pg_advisory_unlock(71245120,1)');await client.end();
  const connection=await connectNativeRuntime(b.runtimeDescriptorFile,migrations,b.runtimeDescriptorSha256);let app:Awaited<ReturnType<typeof createNativeEnterpriseApplication>>|undefined;
  try{app=await createNativeEnterpriseApplication(connection.database,root,{enterpriseId:input.enterpriseId,instanceId:b.operationId,origin:input.origin,proxyToken:freshSecret(),controlToken:freshSecret()},{enterpriseId:input.enterpriseId,runtimeRole:d.runtimeRole,ownershipAcknowledged:true});if(!await app.ready())throw Error('native_prepare_runtime_unavailable');}finally{try{await app?.close();}finally{await connection.database.close();}}
  return {databaseVerified:true,sqlReplayed:false,started:false,modelCalls:0};
 }catch(e){if(transaction)await client.query('ROLLBACK').catch(()=>{});const message=e instanceof Error?e.message:'';throw Error(/^native_prepare_/.test(message)?message:'native_prepare_completion_refused');}finally{await client.end().catch(()=>{});}
}

// The callback is a trusted internal durable-intent writer; no user-supplied SQL or hooks.
// 回调仅用于内部持久提交意图，不接受用户SQL或故障钩子。
export async function initializeNativeDatabase(root:string,bindingInput:unknown,initializationInput:unknown,recordIntent:(intent:NativePreparationIntent)=>Promise<void>){
 if(typeof recordIntent!=='function')throw Error('native_prepare_intent_writer_required');const {b,input,d,r,migrations,migrationSha256,client,assertFiles,runtimePassword,runtimeCa}=await preparationContext(root,bindingInput,initializationInput);
 let active=false,transaction=false,committed=false,commitAttempted=false;client.on('error',()=>{active=false;});client.on('end',()=>{active=false;});
 const assertActive=async()=>{if(!active)throw Error('native_prepare_connection_lost');await assertFiles();};
 try{
  await client.connect();active=true;if((await client.query('SELECT pg_try_advisory_lock(71245120,1) acquired')).rows[0]?.acquired!==true)throw Error('native_prepare_database_in_use');
  const q=(await client.query(barrier,[d.dbaRole,d.runtimeRole])).rows[0];if(!q||Object.values(q).some(v=>v!==true))throw Error('native_prepare_target_not_quarantined');if((await client.query(empty)).rows[0]?.empty!==true)throw Error('native_prepare_target_not_empty');
  // Correct runtime credentials must authenticate but be rejected by the closed CONNECT ACL.
  // 运行凭证须通过认证并被关闭的CONNECT权限拒绝。
  const probe=new pg.Client({host:r.host,port:r.port,database:r.database,user:r.runtimeRole,password:runtimePassword,ssl:{rejectUnauthorized:true,minVersion:'TLSv1.2',ca:runtimeCa},connectionTimeoutMillis:3000});probe.on('error',()=>{});let code='';try{await probe.connect();}catch(e){code=(e as {code?:string}).code??'';}finally{await probe.end().catch(()=>{});}if(code!=='42501')throw Error('native_prepare_runtime_credentials_unconfirmed');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE');transaction=true;await assertActive();
  const again=(await client.query(barrier,[d.dbaRole,d.runtimeRole])).rows[0];if(!again||Object.values(again).some(v=>v!==true)||(await client.query(empty)).rows[0]?.empty!==true)throw Error('native_prepare_target_changed');
  const db:Database={profile:'postgres',query:async(s,p)=>{await assertActive();return {rows:(await client.query(s,p)).rows};},exec:async s=>{await assertActive();return client.query(s);},transaction:async fn=>{await assertActive();return fn(db);},close:async()=>{throw Error('native_prepare_nested_close_forbidden');}};
  // Only the proved empty, DBA-owned public namespace can receive unchanged migrations.
  // 仅已核对为空且归DBA所有的public命名空间接收原迁移。
  await client.query('SET LOCAL search_path=public,pg_catalog');await migrate(db,join(root,'migrations'));await db.query("INSERT INTO enterprise VALUES($1,$2,'enterprise',$3,$4)",[input.enterpriseId,input.name,input.currency,input.timezone]);
  const token=await new IdentityService(db).issueBootstrap(input.enterpriseId);await new OperatorDirectory(db).initialize(token,{username:input.username,password:input.password});await client.query('RESET ROLE');
  await client.query(`GRANT eb_app TO "${d.runtimeRole}" WITH INHERIT FALSE, SET TRUE, ADMIN FALSE`);await client.query(`GRANT USAGE ON SCHEMA public TO "${d.runtimeRole}"`);
  for(const [table,privilege] of nativeHostGrants)await client.query(`GRANT ${privilege} ON TABLE public."${table}" TO "${d.runtimeRole}"`);
  const readonly=(await client.query("SELECT NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ($1,'eb_app') AND (has_table_privilege(r.oid,'public.schema_migration','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(r.oid,'public.schema_migration','INSERT,UPDATE,REFERENCES'))) safe",[d.runtimeRole])).rows[0];if(readonly?.safe!==true)throw Error('native_prepare_migration_write_privilege');
  const identity=(await client.query('SELECT system_identifier::text cluster FROM pg_control_system()')).rows[0];const database=(await client.query('SELECT oid::text oid FROM pg_database WHERE datname=current_database()')).rows[0];if(!identity?.cluster||!database?.oid)throw Error('native_prepare_identity_unavailable');
  const targetSha256=hash(JSON.stringify({host:d.host,port:d.port,database:d.database,cluster:identity.cluster,oid:database.oid}));
  await client.query('INSERT INTO audit_event(enterprise_id,id,kind,details) VALUES($1,$2,$3,$4)',[input.enterpriseId,b.operationId,'native_enterprise_prepared',JSON.stringify({operationId:b.operationId,codeSha256:b.codeSha256,migrationSha256,targetSha256})]);
  await client.query(`GRANT CONNECT ON DATABASE "${d.database}" TO "${d.runtimeRole}"`);
  const flags=(await client.query(`SELECT current_setting('transaction_read_only')='off' rw,current_setting('transaction_isolation')='repeatable read' rr,current_user=$1 AND session_user=$1 AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) actor,(${preparationCatalogueEmpty}) catalogue_empty`,[d.dbaRole])).rows[0];if(!flags||Object.values(flags).some(v=>v!==true))throw Error('native_prepare_transaction_invalid');
  const inventory=await readNativeDatabaseInventoryCore(client,1000000),authoritySha256=await authority(client,d.runtimeRole),intent=Object.freeze({format:1 as const,operationId:b.operationId,enterpriseId:input.enterpriseId,codeSha256:b.codeSha256,migrationSha256,targetSha256,authoritySha256,inventory});
  if(migrations.length!==33||migrations.at(-1)?.id!=='033_business_policy_validation.sql'||inventory.tableCount!==94||hash(JSON.stringify(await readSchemaInventory(join(root,'migrations'))))!==migrationSha256)throw Error('native_prepare_migrations_changed');await assertActive();await recordIntent(intent);await assertActive();commitAttempted=true;await client.query('COMMIT');transaction=false;committed=true;
  await client.query('SELECT pg_advisory_unlock(71245120,1)');await client.end();active=false;
  const connection=await connectNativeRuntime(b.runtimeDescriptorFile,migrations,b.runtimeDescriptorSha256);let app:Awaited<ReturnType<typeof createNativeEnterpriseApplication>>|undefined;
  try{app=await createNativeEnterpriseApplication(connection.database,root,{enterpriseId:input.enterpriseId,instanceId:b.operationId,origin:input.origin,proxyToken:freshSecret(),controlToken:freshSecret()},{enterpriseId:input.enterpriseId,runtimeRole:d.runtimeRole,ownershipAcknowledged:true});if(!await app.ready())throw Error('native_prepare_runtime_unavailable');}finally{try{await app?.close();}finally{await connection.database.close();}}
  return {databasePrepared:true,configurationPrepared:false,started:false,modelCalls:0,intent};
 }catch(e){if(transaction)await client.query('ROLLBACK').catch(()=>{});const message=e instanceof Error?e.message:'';throw Error((committed||commitAttempted)?'native_prepare_completion_required':/^native_prepare_/.test(message)?message:'native_prepare_database_refused');}
 finally{active=false;await client.end().catch(()=>{});}
}
