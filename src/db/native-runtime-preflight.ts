// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Read-only prerequisite observations;never an authorization receipt or host enablement.
// 只读前置观察；不作为授权票据，不启用原生企业宿主。
import {z} from 'zod';
import type {Database,Sql} from './adapter.ts';
import {inspectSchemaHealth} from './schema-health.ts';

const inventory=z.array(z.object({id:z.string().regex(/^\d{3}_[a-z0-9_]+\.sql$/),checksum:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1).max(999).refine(a=>a.every((e,i)=>Number(e.id.slice(0,3))===i+1));
const inputSchema=z.object({enterpriseId:z.uuid(),runtimeRole:z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),expectedMigrations:inventory}).strict();
const failureCodes=['invalid_input','postgres_required','catalog_unavailable','version_unqualified','login_mismatch','unsafe_login','unsafe_app_role','unsafe_membership','ownership_present','ddl_privilege_present','unsafe_definer','required_privilege_missing','migration_write_privilege','unsafe_schema','unsafe_session','enterprise_context_mismatch','enterprise_parent_missing','schema_mismatch','schema_unavailable','database_unavailable'] as const;
type Failure=typeof failureCodes[number];
export type NativeRuntimePreflight={format:'enterprise-brain.native-runtime-preflight/1';prerequisitesMet:boolean;failures:Failure[];schema:{applied:number|null;expected:number|null};hostEnabled:false;authorizationGranted:false};
const report=(failures:Failure[],applied:number|null=null,expected:number|null=null):NativeRuntimePreflight=>({format:'enterprise-brain.native-runtime-preflight/1',prerequisitesMet:failures.length===0,failures,schema:{applied,expected},hostEnabled:false,authorizationGranted:false});

// Bounded scalar projections;never return directory rows or role/database names to callers.
// 有界标量投影；不把目录行或角色/数据库名返回调用者。
const catalogSql=`WITH checked_roles AS (SELECT oid,rolname FROM pg_catalog.pg_roles WHERE rolname IN (current_user,'eb_app')) SELECT
 current_setting('server_version_num')::integer BETWEEN 170000 AND 179999 AS version_ok,
 session_user=$1 AND current_user=$1 AS login_matches,
 EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication) AS login_safe,
 EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='eb_app' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication) AS app_safe,
 COALESCE(pg_catalog.pg_has_role(current_user,pg_catalog.to_regrole('eb_app'),'SET'),false)
 AND NOT COALESCE(pg_catalog.pg_has_role(current_user,pg_catalog.to_regrole('eb_app'),'USAGE'),true)
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname NOT IN (current_user,'eb_app') AND pg_catalog.pg_has_role(current_user,r.oid,'MEMBER'))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member WHERE r.rolname=current_user AND m.admin_option) AS membership_safe,
 NOT EXISTS(SELECT 1 FROM pg_catalog.pg_database WHERE datname=current_database() AND datdba IN (SELECT oid FROM checked_roles))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relowner IN (SELECT oid FROM checked_roles))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE proowner IN (SELECT oid FROM checked_roles))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_type WHERE typowner IN (SELECT oid FROM checked_roles))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner IN (SELECT oid FROM checked_roles)) AS ownership_safe,
 NOT EXISTS(SELECT 1 FROM checked_roles cr WHERE pg_catalog.has_database_privilege(cr.oid,current_database(),'CREATE,TEMP')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND pg_catalog.has_schema_privilege(cr.oid,n.oid,'CREATE'))) AS ddl_safe,
 NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND p.prosecdef AND EXISTS(SELECT 1 FROM checked_roles cr WHERE pg_catalog.has_function_privilege(cr.oid,p.oid,'EXECUTE'))) AS definer_safe,
 pg_catalog.has_schema_privilege(current_user,'public','USAGE')
 AND COALESCE(pg_catalog.has_table_privilege(current_user,pg_catalog.to_regclass('public.schema_migration'),'SELECT'),false)
 AND COALESCE(pg_catalog.has_table_privilege(current_user,pg_catalog.to_regclass('public.enterprise'),'SELECT'),false)
 AND COALESCE(pg_catalog.has_table_privilege(current_user,pg_catalog.to_regclass('public.enterprise'),'UPDATE'),false)
 AND COALESCE(pg_catalog.has_table_privilege(current_user,pg_catalog.to_regclass('public.principal'),'SELECT'),false)
 AND COALESCE(pg_catalog.has_table_privilege(current_user,pg_catalog.to_regclass('public.principal'),'UPDATE'),false) AS required_privileges,
 NOT EXISTS(SELECT 1 FROM checked_roles cr WHERE COALESCE(pg_catalog.has_table_privilege(cr.oid,pg_catalog.to_regclass('public.schema_migration'),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),true)
 OR COALESCE(pg_catalog.has_any_column_privilege(cr.oid,pg_catalog.to_regclass('public.schema_migration'),'INSERT,UPDATE,REFERENCES'),true)) AS migration_readonly,
 EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid=pg_catalog.to_regclass('public.enterprise') AND relkind='r' AND relrowsecurity AND relforcerowsecurity) AS schema_safe,
 current_setting('row_security')='on' AND pg_catalog.pg_my_temp_schema()=0 AND NOT EXISTS(SELECT 1 FROM unnest(current_schemas(false)) s WHERE s NOT IN ('public','pg_catalog')) AS session_safe,
 current_setting('app.enterprise_id',true)=$2 AS tenant_matches`;
const flags:ReadonlyArray<readonly [string,Failure]>=[['version_ok','version_unqualified'],['login_matches','login_mismatch'],['login_safe','unsafe_login'],['app_safe','unsafe_app_role'],['membership_safe','unsafe_membership'],['ownership_safe','ownership_present'],['ddl_safe','ddl_privilege_present'],['definer_safe','unsafe_definer'],['required_privileges','required_privilege_missing'],['migration_readonly','migration_write_privilege'],['schema_safe','unsafe_schema'],['session_safe','unsafe_session'],['tenant_matches','enterprise_context_mismatch']];
// Shared static role policy for a quarantined target checked by its DBA before CONNECT.
// 隔离目标在CONNECT前由DBA只读复用相同静态角色策略；原运行检查不变。
export {catalogSql as nativeRuntimeCatalogueSql};

export async function inspectNativeRuntime(db:Database,input:unknown):Promise<NativeRuntimePreflight>{
 const parsed=inputSchema.safeParse(input);if(!parsed.success)return report(['invalid_input']);
 if(db.profile!=='postgres')return report(['postgres_required']);
 const q=parsed.data;
 try{return await db.transaction(async(tx:Sql)=>{
  await tx.exec("SET TRANSACTION READ ONLY; SET LOCAL statement_timeout='3000'; SET LOCAL lock_timeout='1000'");
  const rows=(await tx.query(catalogSql,[q.runtimeRole,q.enterpriseId])).rows;
  if(rows.length!==1||flags.some(([key])=>typeof rows[0][key]!=='boolean'&&rows[0][key]!==null))return report(['catalog_unavailable'],null,q.expectedMigrations.length);
  const failures=flags.filter(([key])=>rows[0][key]!==true).map(([,code])=>code);
  if(failures.length)return report(failures,null,q.expectedMigrations.length);
  const parent=(await tx.query('SELECT id,environment FROM public.enterprise WHERE id=$1',[q.enterpriseId])).rows;
  if(parent.length!==1||parent[0].id!==q.enterpriseId||parent[0].environment!=='enterprise')return report(['enterprise_parent_missing'],null,q.expectedMigrations.length);
  const health=await inspectSchemaHealth(tx,q.expectedMigrations);
  return report(health.state==='current'?[]:[health.state==='mismatch'?'schema_mismatch':'schema_unavailable'],health.applied,q.expectedMigrations.length);
 });}catch{return report(['database_unavailable'],null,q.expectedMigrations.length);}
}
