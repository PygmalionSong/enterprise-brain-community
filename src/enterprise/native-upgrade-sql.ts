// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Internal signed appendices only. The caller owns target authorization, outer transaction and durable intent.
// 内部仅接受已验签名追加迁移；目标授权、外层事务与持久意图由受控调用方负责。
import {readFile} from 'node:fs/promises';import {join} from 'node:path';import {createHash,randomUUID} from 'node:crypto';import type pg from 'pg';
import {inspectNativeUpgradePlan,nativeUpgradePlanInputSchema} from './native-upgrade-plan.ts';import {readSchemaInventory,type SchemaInventory} from '../db/schema-health.ts';
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
export type NativeUpgradeSignedSql=Readonly<{format:1;id:string;currentManifestSha256:string;candidateManifestSha256:string;currentSchema:number;candidateSchema:number;appendices:number}>;
type Proof={inputFile:string;inputSha256:string;currentRoot:string;candidateRoot:string;binding:Awaited<ReturnType<typeof inspectNativeUpgradePlan>>['binding'];current:SchemaInventory;candidate:SchemaInventory;sql:ReadonlyArray<Readonly<{id:string;checksum:string;sql:string}>>;used:boolean};
const proofs=new WeakMap<NativeUpgradeSignedSql,Proof>();
export async function readNativeUpgradeSignedSql(planningInputFile:string,expectedPlanningInputSha256:string):Promise<NativeUpgradeSignedSql>{
 if(!/^[a-f0-9]{64}$/.test(expectedPlanningInputSha256))throw Error('native_upgrade_sql_input_binding_invalid');const report=await inspectNativeUpgradePlan(planningInputFile);if(report.binding.inputSha256!==expectedPlanningInputSha256)throw Error('native_upgrade_sql_input_changed');
 const input=await readFile(planningInputFile);if(hash(input)!==expectedPlanningInputSha256)throw Error('native_upgrade_sql_input_changed');const q=nativeUpgradePlanInputSchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(input))),current=await readSchemaInventory(join(q.currentRoot,'migrations')),candidate=await readSchemaInventory(join(q.candidateRoot,'migrations')),sql=[];
 if(current.length!==report.static.current.schemaFiles||candidate.length!==report.static.candidate.schemaFiles||current.some((m,i)=>m.id!==candidate[i]?.id||m.checksum!==candidate[i]?.checksum))throw Error('native_upgrade_sql_migration_changed');
 for(const m of candidate.slice(current.length)){const b=await readFile(join(q.candidateRoot,'migrations',m.id));if(hash(b)!==m.checksum)throw Error('native_upgrade_sql_migration_changed');sql.push(Object.freeze({...m,sql:new TextDecoder('utf-8',{fatal:true}).decode(b)}));}
 const final=await inspectNativeUpgradePlan(planningInputFile);if(JSON.stringify(final.binding)!==JSON.stringify(report.binding))throw Error('native_upgrade_sql_signature_changed');
 const token=Object.freeze({format:1 as const,id:randomUUID(),currentManifestSha256:report.binding.currentManifestSha256,candidateManifestSha256:report.binding.candidateManifestSha256,currentSchema:current.length,candidateSchema:candidate.length,appendices:sql.length});proofs.set(token,{inputFile:planningInputFile,inputSha256:expectedPlanningInputSha256,currentRoot:q.currentRoot,candidateRoot:q.candidateRoot,binding:report.binding,current,candidate,sql,used:false});return token;
}
async function stable(p:Proof){const actual=await inspectNativeUpgradePlan(p.inputFile);if(actual.binding.inputSha256!==p.inputSha256||JSON.stringify(actual.binding)!==JSON.stringify(p.binding))throw Error('native_upgrade_sql_signature_changed');}
// Expose only authenticated identities/inventories; SQL text remains private.
// 仅返回已认证身份/清单，SQL文本保持私有。
export async function nativeUpgradeSqlIdentity(token:NativeUpgradeSignedSql){const p=proofs.get(token);if(!p)throw Error('native_upgrade_sql_verification_required');await stable(p);return Object.freeze({currentRoot:p.currentRoot,candidateRoot:p.candidateRoot,binding:Object.freeze({...p.binding}),current:structuredClone(p.current),candidate:structuredClone(p.candidate)});}
const barrier="SELECT current_user=session_user actor,EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolsuper AND rolcanlogin) privileged,current_setting('server_version_num')::integer BETWEEN 170000 AND 179999 version,current_setting('transaction_read_only')='off' writable,current_setting('transaction_isolation')='repeatable read' snapshot,EXISTS(SELECT 1 FROM pg_catalog.pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl) tls,EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()) AND pid=pg_backend_pid() AND classid=71245120 AND objid=1 AND objsubid=2 AND granted) owner,pg_catalog.pg_current_xact_id()::text=$1 xid";
// Never start/commit/rollback here. A SELECT-invoked function keeps appendix transaction control non-top-level.
// 此处不开始/提交/回滚事务；由SELECT调用函数，使追加SQL不能在顶层结束事务。
export async function applyNativeUpgradeSignedSql(token:NativeUpgradeSignedSql,client:pg.Client){
 const p=proofs.get(token);if(!p||p.used)throw Error('native_upgrade_sql_verification_required');await stable(p);
 const xid=(await client.query('SELECT pg_catalog.pg_current_xact_id()::text xid')).rows[0]?.xid;if(typeof xid!=='string')throw Error('native_upgrade_sql_outer_transaction_required');
 const guard=async()=>{const flags=(await client.query(barrier,[xid])).rows[0];if(!flags||Object.values(flags).some(v=>v!==true))throw Error('native_upgrade_sql_outer_transaction_required');};await guard();
 const ledger=async(expected:SchemaInventory)=>{const rows=(await client.query('SELECT id,checksum FROM public.schema_migration ORDER BY id')).rows;if(JSON.stringify(rows)!==JSON.stringify(expected))throw Error('native_upgrade_sql_ledger_changed');};await ledger(p.current);
 p.used=true;await client.query('SELECT pg_catalog.pg_advisory_xact_lock(71245119)');
 if(p.sql.length){
  const fn='eb_upgrade_'+randomUUID().replaceAll('-','');await client.query(`CREATE FUNCTION pg_temp."${fn}"(command text) RETURNS void LANGUAGE plpgsql AS $body$ BEGIN EXECUTE command; END; $body$`);
  for(const m of p.sql){await stable(p);await guard();await client.query("SET LOCAL search_path=public,pg_catalog; SET LOCAL standard_conforming_strings=on");await client.query(`SELECT pg_temp."${fn}"($1::text)`,[m.sql]);await client.query('SET LOCAL search_path=pg_catalog,public');await guard();await client.query('INSERT INTO public.schema_migration(id,checksum) VALUES($1,$2)',[m.id,m.checksum]);}
 }
 await stable(p);await guard();await ledger(p.candidate);return {appended:p.sql.map(m=>m.id),previousSchema:p.current.length,candidateSchema:p.candidate.length,outerTransactionCommitted:false,candidateJavaScriptExecuted:false};
}
