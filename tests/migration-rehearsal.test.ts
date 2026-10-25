// Migration SQL runs only against an owned disposable shadow database.
// 迁移SQL仅执行于自有可弃置影子数据库。
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {openDatabase} from '../src/db/adapter.ts';
import {migrate} from '../src/db/migrate.ts';
import {rehearseMigrations} from '../src/db/migration-rehearsal.ts';

async function fixture(){const dir=await mkdtemp(resolve('.evidence/shadow-migration-')),migrations=join(dir,'migrations');await mkdir(migrations);await writeFile(join(migrations,'001_core.sql'),"CREATE TABLE business(id text PRIMARY KEY,value jsonb NOT NULL);INSERT INTO business VALUES('original','{\"nested\":{\"b\":2,\"a\":1}}');ALTER TABLE business ENABLE ROW LEVEL SECURITY;CREATE POLICY owned ON business USING (true);");const db=await openDatabase(':memory:');await migrate(db,migrations);return {dir,migrations,db,async add(sql:string,name='002_change.sql'){await writeFile(join(migrations,name),sql);},async close(){await db.close();assert.ok(dir.startsWith(resolve('.evidence')+sep));await rm(dir,{recursive:true,force:true});}};}

test('shadow migration: same-schema code patch preserves every table without application execution',async()=>{const f=await fixture();try{const result=await rehearseMigrations(f.db,f.migrations,1);assert.equal(result.appliedMigrations.length,0);assert.equal(result.candidateApplicationExecuted,false);assert.equal(result.canCutover,false);assert.equal(result.existingTables.find(table=>table.table==='business')?.originalRows,1);}finally{await f.close();}});

test('shadow migration: append-only new table/column preserves original data and migration identity',async()=>{const f=await fixture();try{await f.add('ALTER TABLE business ADD COLUMN note text;CREATE TABLE added(id text);');const result=await rehearseMigrations(f.db,f.migrations,1);assert.deepEqual(result.appliedMigrations,['002_change.sql']);assert.deepEqual(result.addedTables,[{table:'added',rows:0}]);assert.deepEqual(result.existingTables.find(table=>table.table==='business')?.addedColumns,['note']);assert.equal(result.candidateMigrationExecuted,true);assert.equal(result.semanticCompatibilityProven,false);}finally{await f.close();}});

test('shadow migration: changing or deleting an original business row fails instead of blessing a destructive upgrade',async()=>{for(const sql of ["UPDATE business SET value='{}'",'DELETE FROM business']){const f=await fixture();try{await f.add(sql);await assert.rejects(rehearseMigrations(f.db,f.migrations,1),/rehearsal_existing_data_changed/);}finally{await f.close();}}});

test('shadow migration: removed tables or columns cannot pass a snapshot comparison',async()=>{for(const sql of ['DROP TABLE business','ALTER TABLE business DROP COLUMN value']){const f=await fixture();try{await f.add(sql);await assert.rejects(rehearseMigrations(f.db,f.migrations,1),/rehearsal_(table_removed|column_changed)/);}finally{await f.close();}}});

test('shadow migration: row-level policy or RLS changes fail even when all row values remain unchanged',async()=>{for(const sql of ['ALTER TABLE business DISABLE ROW LEVEL SECURITY','DROP POLICY owned ON business']){const f=await fixture();try{await f.add(sql);await assert.rejects(rehearseMigrations(f.db,f.migrations,1),/rehearsal_table_contract_changed/);}finally{await f.close();}}});

test('shadow migration: role contract changes are not mistaken for data-preserving compatibility',async()=>{const f=await fixture();try{await f.add('CREATE ROLE unexpected_role;');await assert.rejects(rehearseMigrations(f.db,f.migrations,1),/rehearsal_role_contract_changed/);}finally{await f.close();}});

test('shadow migration: failed SQL rolls back that migration and leaves earlier shadow-only migration visible',async()=>{const f=await fixture();try{await f.add('CREATE TABLE shadow_only(id text);');await f.add('CREATE TABLE must_rollback(id text);SELECT missing_function();','003_failure.sql');await assert.rejects(rehearseMigrations(f.db,f.migrations,1),(error:any)=>{assert.equal(error.message,'rehearsal_sql_failed');assert.equal(error.migrationId,'003_failure.sql');assert.equal(error.sqlState,'42883');assert.equal(error.partialShadowMigration,true);return true;});assert.equal((await f.db.query("SELECT to_regclass('public.shadow_only') AS found")).rows[0].found,'shadow_only');assert.equal((await f.db.query("SELECT to_regclass('public.must_rollback') AS found")).rows[0].found,null);assert.equal((await f.db.query('SELECT * FROM business')).rows.length,1);assert.equal((await f.db.query('SELECT * FROM schema_migration')).rows.length,2);}finally{await f.close();}});

test('shadow migration: altered prior checksum is rejected before candidate SQL executes',async()=>{const f=await fixture();try{await writeFile(join(f.migrations,'001_core.sql'),'DROP TABLE business;');await f.add('DROP TABLE business;');await assert.rejects(rehearseMigrations(f.db,f.migrations,1),/rehearsal_migration_prefix_mismatch/);assert.equal((await f.db.query('SELECT * FROM business')).rows.length,1);}finally{await f.close();}});

test('shadow migration: unverified database profiles are refused before any query',async()=>{await assert.rejects(rehearseMigrations({profile:'postgres'} as any,'unused',1),/rehearsal_profile_unverified/);});

test('shadow migration: changing an old column default fails even if existing values are unchanged',async()=>{const f=await fixture();try{await f.add("ALTER TABLE business ALTER COLUMN value SET DEFAULT '{}';");await assert.rejects(rehearseMigrations(f.db,f.migrations,1),/rehearsal_column_changed/);}finally{await f.close();}});

test('shadow migration: original applied-at history cannot be rewritten while retaining IDs and checksums',async()=>{const f=await fixture();try{await f.add("UPDATE schema_migration SET applied_at='2000-01-01T00:00:00Z';");await assert.rejects(rehearseMigrations(f.db,f.migrations,1),/rehearsal_migration_history_changed/);}finally{await f.close();}});

test('shadow migration: microsecond timestamps and high precision numeric changes cannot disappear through JS rounding',async()=>{for(const update of ["UPDATE precise SET instant=instant+interval '1 microsecond'","UPDATE precise SET amount=amount+0.000000000000000001"]){const f=await fixture();try{await f.db.exec("CREATE TABLE precise(instant timestamptz,amount numeric);INSERT INTO precise VALUES('2026-10-16T00:00:00.000001Z',12345678901234567890.123456789012345678);");await f.add(update);await assert.rejects(rehearseMigrations(f.db,f.migrations,1),/rehearsal_existing_data_changed/);}finally{await f.close();}}});
