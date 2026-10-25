// Fixed existing-row/sequence projection for trusted upgrade transactions; not an arbitrary SQL reader.
// 受信升级事务使用的固定旧行/序列投影，不是任意SQL读取接口。
import type pg from 'pg';import {createHash,randomUUID} from 'node:crypto';import {z} from 'zod';
import {readNativeCatalogueProjectionCore} from './native-database-inventory-core.ts';
import {preparationCatalogueEmpty} from './native-dba-core.ts';
const item=z.object({name:z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),kind:z.enum(['r','p','S'])}).strict(),inventory=z.array(item).min(1).max(10000),hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export type NativeUpgradeOldTables=z.infer<typeof inventory>;
async function guard(client:pg.Client){const f=(await client.query("SELECT current_setting('transaction_isolation')='repeatable read' snapshot,EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolsuper) privileged,EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()) AND pid=pg_backend_pid() AND classid=71245120 AND objid=1 AND objsubid=2 AND granted) owner")).rows[0];if(!f||Object.values(f).some(v=>v!==true))throw Error('native_upgrade_preservation_transaction_required');}
export async function readNativeUpgradeOldTables(client:pg.Client):Promise<NativeUpgradeOldTables>{await guard(client);const rows=(await client.query("SELECT c.relname name,c.relkind kind FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S') AND c.relname<>'schema_migration' ORDER BY c.relname COLLATE \"C\"")).rows;return inventory.parse(rows);}
export async function nativeUpgradeOldRowsSha256(client:pg.Client,value:NativeUpgradeOldTables,maxRows=1000000){
 await guard(client);const tables=inventory.parse(value);if(new Set(tables.map(t=>t.name)).size!==tables.length||!Number.isSafeInteger(maxRows)||maxRows<1||maxRows>10000000)throw Error('native_upgrade_preservation_limit');
 await client.query("SET LOCAL TimeZone='UTC';SET LOCAL DateStyle='ISO,YMD';SET LOCAL IntervalStyle='postgres';SET LOCAL extra_float_digits=3;SET LOCAL bytea_output='hex'");
 let total=0;const result=[];
 for(const t of tables){
  const actual=(await client.query("SELECT c.relkind kind FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1",[t.name])).rows;if(actual.length!==1||actual[0].kind!==t.kind)throw Error('native_upgrade_preservation_table_changed');
  const cursor='eb_upgrade_rows_'+randomUUID().replaceAll('-',''),sum=createHash('sha256'),row=t.kind==='S'?'jsonb_build_array(t.last_value::text,t.is_called)':'to_jsonb(t)';let rows=0;
  await client.query(`DECLARE "${cursor}" NO SCROLL CURSOR FOR SELECT h FROM (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(${row}::text,'UTF8')),'hex') h FROM public."${t.name}" t) s ORDER BY h COLLATE "C"`);
  try{while(true){const batch=(await client.query(`FETCH FORWARD 1000 FROM "${cursor}"`)).rows;if(!batch.length)break;for(const r of batch){if(typeof r.h!=='string'||!/^[a-f0-9]{64}$/.test(r.h)||++total>maxRows)throw Error('native_upgrade_preservation_limit');rows++;sum.update(r.h+'\n','ascii');}}}finally{await client.query(`CLOSE "${cursor}"`).catch(()=>{});}
  result.push({...t,rows,sha256:sum.digest('hex')});
 }
 return {sha256:hash(JSON.stringify(result)),rows:total,tables:tables.length};
}
export async function nativeUpgradeGlobalRolesSha256(client:pg.Client){
 await guard(client);const counts=(await client.query('SELECT (SELECT count(*)::integer FROM pg_catalog.pg_roles) roles,(SELECT count(*)::integer FROM pg_catalog.pg_auth_members) memberships,(SELECT count(*)::integer FROM pg_catalog.pg_db_role_setting) settings')).rows[0];if(!counts||counts.roles>10000||counts.memberships>10000||counts.settings>10000)throw Error('native_upgrade_roles_limit');
 const r=(await client.query("SELECT jsonb_build_object('roles',(SELECT jsonb_agg(jsonb_build_array(r.oid::text,r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin,r.rolreplication,r.rolconnlimit,r.rolvaliduntil,r.rolbypassrls,r.rolconfig,pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(a.rolpassword,''),'UTF8')),'hex')) ORDER BY r.oid) FROM pg_catalog.pg_roles r JOIN pg_catalog.pg_authid a ON a.oid=r.oid),'members',(SELECT COALESCE(jsonb_agg(jsonb_build_array(roleid::text,member::text,grantor::text,admin_option,inherit_option,set_option) ORDER BY roleid,member,grantor),'[]'::jsonb) FROM pg_catalog.pg_auth_members),'settings',(SELECT COALESCE(jsonb_agg(jsonb_build_array(setdatabase::text,setrole::text,setconfig) ORDER BY setdatabase,setrole),'[]'::jsonb) FROM pg_catalog.pg_db_role_setting))::text value")).rows[0]?.value;if(typeof r!=='string'||Buffer.byteLength(r)>8388608)throw Error('native_upgrade_roles_limit');return hash(r);
}
export async function captureNativeUpgradePreservation(client:pg.Client){await guard(client);if((await client.query(`SELECT (${preparationCatalogueEmpty}) supported`)).rows[0]?.supported!==true)throw Error('native_upgrade_unsupported_catalogue');const tables=await readNativeUpgradeOldTables(client);return {tables,rows:await nativeUpgradeOldRowsSha256(client,tables),catalogue:await readNativeCatalogueProjectionCore(client),globalRolesSha256:await nativeUpgradeGlobalRolesSha256(client)};}
export async function assertNativeUpgradePreservation(client:pg.Client,expected:Awaited<ReturnType<typeof captureNativeUpgradePreservation>>){
 await guard(client);if((await client.query(`SELECT (${preparationCatalogueEmpty}) supported`)).rows[0]?.supported!==true)throw Error('native_upgrade_unsupported_catalogue');if(JSON.stringify(await nativeUpgradeOldRowsSha256(client,expected.tables))!==JSON.stringify(expected.rows))throw Error('native_upgrade_existing_rows_changed');
 const actual=new Map((await readNativeCatalogueProjectionCore(client)).map(e=>[e.key,e.sha256]));if(expected.catalogue.some(e=>actual.get(e.key)!==e.sha256))throw Error('native_upgrade_existing_catalogue_changed');
 if(await nativeUpgradeGlobalRolesSha256(client)!==expected.globalRolesSha256)throw Error('native_upgrade_global_roles_changed');return {existingRowsPreserved:true,existingCataloguePreserved:true,globalRolesPreserved:true};
}
