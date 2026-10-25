import test from 'node:test';import assert from 'node:assert/strict';
import type {Database} from '../src/db/adapter.ts';import {openDatabase} from '../src/db/adapter.ts';
import {inspectNativeRuntime} from '../src/db/native-runtime-preflight.ts';
const input={enterpriseId:'11111111-1111-4111-8111-111111111111',runtimeRole:'owned_runtime',expectedMigrations:[{id:'001_owned.sql',checksum:'a'.repeat(64)}]};
test('native preflight: malformed inputs never acquire a connection or execute SQL',async()=>{
 let calls=0;const db={profile:'postgres',transaction:async()=>{calls++;throw Error('private')},query:async()=>{calls++;throw Error('private')},exec:async()=>{calls++;},close:async()=>{}} as Database;
 for(const value of [null,{}, {...input,connectionString:'private'},{...input,runtimeRole:'admin;SET ROLE'},{...input,enterpriseId:'wrong'},{...input,expectedMigrations:[]},{...input,expectedMigrations:[{id:'002_gap.sql',checksum:'a'.repeat(64)}]},{...input,expectedMigrations:[{id:'001_owned.sql',checksum:'a'.repeat(64),extra:true}]}])assert.deepEqual((await inspectNativeRuntime(db,value)).failures,['invalid_input']);
 assert.equal(calls,0);
});
test('native preflight: actual embedded database is rejected without changing its tables or role',async()=>{
 const db=await openDatabase(':memory:');try{await db.exec('CREATE TABLE unchanged(value text)');await db.query('INSERT INTO unchanged VALUES($1)',['owned']);const before=(await db.query('SELECT current_user')).rows;const value=await inspectNativeRuntime(db,input);assert.deepEqual(value.failures,['postgres_required']);assert.equal(value.hostEnabled,false);assert.equal(value.authorizationGranted,false);assert.deepEqual((await db.query('SELECT current_user')).rows,before);assert.deepEqual((await db.query('SELECT * FROM unchanged')).rows,[{value:'owned'}]);}finally{await db.close();}
});
test('native preflight: transport/transaction errors are redacted and never become a host pass',async()=>{
 const secret='password://private-role@private-host/business';const db={profile:'postgres',transaction:async()=>{throw Error(secret)}} as unknown as Database;
 const result=await inspectNativeRuntime(db,input);assert.deepEqual(result.failures,['database_unavailable']);assert.equal(result.prerequisitesMet,false);assert.equal(result.hostEnabled,false);assert.equal(result.authorizationGranted,false);assert.equal(JSON.stringify(result).includes(secret),false);assert.deepEqual(result.schema,{applied:null,expected:1});
});
