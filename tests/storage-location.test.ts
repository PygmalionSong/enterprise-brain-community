// Empty/cleared configuration must preserve actual SQL records after reopen.
// 空/清除配置必须在重开后保留真实SQL记录，使用新临时目录。
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {serverDatabaseLocation} from '../src/db/location.ts';import {openDatabase} from '../src/db/adapter.ts';
for(const value of ['', ' \t\n'])test('E6 storage: '+(value?'whitespace':'empty')+' database configuration persists SQL across reopen',async()=>{
 const root=await mkdtemp(join(tmpdir(),'eb-storage-default-'));await mkdir(join(root,'.data'));const location=serverDatabaseLocation(root,{DATABASE_URL:value});let db=await openDatabase(location);try{await db.exec('CREATE TABLE persistence_probe(value text NOT NULL)');await db.query('INSERT INTO persistence_probe VALUES($1)',['fixture-retained']);}finally{await db.close();}
 db=await openDatabase(location);try{const tables=await db.query("SELECT table_name FROM information_schema.tables WHERE table_name='persistence_probe'");assert.equal(tables.rows.length,1);const rows=await db.query('SELECT value FROM persistence_probe');assert.equal(rows.rows[0].value,'fixture-retained');}finally{await db.close();}
});
test('E6 storage: environment cannot select an arbitrary file or memory database path',()=>{for(const url of [':memory:','relative-file','/outside','file:///tmp/elsewhere'])assert.throws(()=>serverDatabaseLocation('owned-root',{DATABASE_URL:url}),/invalid_database_url/);});
