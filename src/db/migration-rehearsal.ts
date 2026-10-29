// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Conservative shadow-only migration checks, not production upgrade or arbitrary rollback.
// 保守的影子库迁移检查，不是生产升级或任意回退。
import {readFile,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import type {Database} from './adapter.ts';
import {migrate} from './migrate.ts';

const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const quote=(value:string)=>'"'+value.replaceAll('"','""')+'"';
function canonical(value:unknown):string {
 if(value instanceof Date)return JSON.stringify({date:value.toISOString()});
 if(value instanceof Uint8Array)return JSON.stringify({bytes:Buffer.from(value).toString('base64')});
 if(typeof value==='bigint')return JSON.stringify({bigint:value.toString()});
 if(typeof value==='number'&&!Number.isFinite(value))return JSON.stringify({number:String(value)});
 if(value===null||typeof value!=='object'){const result=JSON.stringify(value);if(result===undefined)throw Error('rehearsal_value_invalid');return result;}
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([key,item])=>JSON.stringify(key)+':'+canonical(item)).join(',')+'}';
}
type Column={column_name:string;data_type:string;udt_name:string;[key:string]:unknown};
type Table={name:string;columns:Column[];rowHashes:string[];dataSha256:string;rowCount:number;contractSha256:string};
type Snapshot={tables:Table[];rows:number;roleSha256:string;membershipSha256:string;functions:Map<string,string>};
async function snapshot(db:Database,prior?:Snapshot):Promise<Snapshot>{
 const names=(await db.query<{table_name:string}>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(row=>row.table_name);if(names.length>200)throw Error('rehearsal_snapshot_limit');
 let rows=0,totalBytes=0;const tables:Table[]=[];
 for(const name of names){
  const columns=(await db.query<Column>("SELECT column_name,data_type,udt_name,column_default,is_nullable,character_maximum_length,numeric_precision,numeric_scale,datetime_precision,collation_name,is_identity,identity_generation,is_generated,generation_expression FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[name])).rows;if(columns.length>256)throw Error('rehearsal_snapshot_limit');
  const old=prior?.tables.find(table=>table.name===name),selected=old?.columns??columns;
  if(old&&old.columns.some(column=>!columns.some(current=>canonical(current)===canonical(column))))throw Error('rehearsal_column_changed');
  const count=Number((await db.query<{count:string}>('SELECT COUNT(*)::text AS count FROM public.'+quote(name))).rows[0].count);if(count>20000||(rows+=count)>100000)throw Error('rehearsal_snapshot_limit');
  // Let PostgreSQL serialize exact numeric/timestamp values before the JS driver can round them.
  // 在JS驱动可能舍入前，由数据库序列化完整数值和微秒时间。
  const contents=(await db.query<{encoded:string}>('SELECT to_jsonb(ROW('+selected.map(column=>quote(column.column_name)).join(',')+'))::text AS encoded FROM public.'+quote(name))).rows,rowHashes=contents.map(row=>{const text=row.encoded;if((totalBytes+=Buffer.byteLength(text))>32*1024*1024)throw Error('rehearsal_snapshot_limit');return sha(text);}).sort();
  const security=(await db.query("SELECT c.relrowsecurity,c.relforcerowsecurity,c.relacl,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1",[name])).rows;
  const policies=(await db.query('SELECT policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname=$1 AND tablename=$2 ORDER BY policyname',['public',name])).rows;
  const constraints=(await db.query("SELECT conname,contype,pg_get_constraintdef(co.oid) AS definition FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1 ORDER BY conname",[name])).rows;
  tables.push({name,columns,rowHashes,dataSha256:sha(canonical(rowHashes)),rowCount:count,contractSha256:sha(canonical({security,policies,constraints}))});
 }
 if(prior&&prior.tables.some(table=>!names.includes(table.name)))throw Error('rehearsal_table_removed');
 const roles=(await db.query('SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit FROM pg_roles ORDER BY rolname')).rows;
 const memberships=(await db.query('SELECT roleid::text,member::text,grantor::text,admin_option FROM pg_auth_members ORDER BY roleid,member,grantor')).rows;
 const functions=new Map((await db.query<{signature:string;definition:string}>("SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY signature")).rows.map(row=>[row.signature,sha(row.definition)]));
 return {tables,rows,roleSha256:sha(canonical(roles)),membershipSha256:sha(canonical(memberships)),functions};
}
async function migrationInventory(directory:string){
 const names=(await readdir(directory)).sort(),inventory:{id:string;checksum:string}[]=[];if(!names.length||names.length>999)throw Error('rehearsal_migration_inventory_invalid');
 for(let i=0;i<names.length;i++){const name=names[i],match=/^(\d{3})_[a-z0-9_]+\.sql$/.exec(name);if(!match||Number(match[1])!==i+1)throw Error('rehearsal_migration_inventory_invalid');const file=join(directory,name),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024)throw Error('rehearsal_migration_inventory_invalid');inventory.push({id:name,checksum:sha(await readFile(file))});}return inventory;
}
export async function rehearseMigrations(db:Database,directory:string,currentSchemaFiles:number){
 if(db.profile!=='pglite')throw Error('rehearsal_profile_unverified');if(!Number.isInteger(currentSchemaFiles)||currentSchemaFiles<1)throw Error('rehearsal_schema_invalid');
 const inventory=await migrationInventory(directory),existing=(await db.query<{id:string;checksum:string}>('SELECT id,checksum FROM schema_migration ORDER BY id')).rows;
 if(existing.length!==currentSchemaFiles||canonical(existing)!==canonical(inventory.slice(0,currentSchemaFiles)))throw Error('rehearsal_migration_prefix_mismatch');
 const before=await snapshot(db);let applied:string[];
 try{applied=await migrate(db,directory);}catch(e){const appliedIds=(await db.query<{id:string}>('SELECT id FROM schema_migration ORDER BY id')).rows.map(row=>row.id),failed=inventory.find(row=>!appliedIds.includes(row.id));throw Object.assign(Error('rehearsal_sql_failed'),{migrationId:failed?.id??null,sqlState:/^[0-9A-Z]{5}$/.test((e as any)?.code??'')?(e as any).code:null,partialShadowMigration:appliedIds.length>currentSchemaFiles});}
 const after=await snapshot(db,before);
 if(canonical(applied)!==canonical(inventory.slice(currentSchemaFiles).map(row=>row.id)))throw Error('rehearsal_migration_result_mismatch');
 const final=(await db.query<{id:string;checksum:string}>('SELECT id,checksum FROM schema_migration ORDER BY id')).rows;if(canonical(final)!==canonical(inventory))throw Error('rehearsal_migration_result_mismatch');
 for(const table of before.tables){const current=after.tables.find(item=>item.name===table.name)!;if(table.contractSha256!==current.contractSha256)throw Error('rehearsal_table_contract_changed');if(table.name==='schema_migration'){const counts=new Map<string,number>();for(const hash of current.rowHashes)counts.set(hash,(counts.get(hash)??0)+1);for(const hash of table.rowHashes){const n=counts.get(hash)??0;if(n<1)throw Error('rehearsal_migration_history_changed');counts.set(hash,n-1);}}else if(table.dataSha256!==current.dataSha256)throw Error('rehearsal_existing_data_changed');}
 if(before.roleSha256!==after.roleSha256||before.membershipSha256!==after.membershipSha256)throw Error('rehearsal_role_contract_changed');
 for(const [signature,hash]of before.functions)if(after.functions.get(signature)!==hash)throw Error('rehearsal_function_changed');
 const summary=before.tables.map(table=>({table:table.name,originalRows:table.rowCount,preservedOriginalColumns:table.columns.length,dataSha256:table.dataSha256,addedColumns:after.tables.find(item=>item.name===table.name)!.columns.filter(column=>!table.columns.some(old=>old.column_name===column.column_name)).map(column=>column.column_name)}));
 return {status:'SHADOW_MIGRATION_PRESERVATION_VERIFIED' as const,appliedMigrations:applied,previousSchemaFiles:currentSchemaFiles,candidateSchemaFiles:inventory.length,existingTables:summary,addedTables:after.tables.filter(table=>!before.tables.some(old=>old.name===table.name)).map(table=>({table:table.name,rows:table.rowCount})),originalRows:before.rows,candidateMigrationExecuted:applied.length>0,candidateApplicationExecuted:false,servicesStarted:false,canCutover:false,productionReady:false,semanticCompatibilityProven:false};
}
