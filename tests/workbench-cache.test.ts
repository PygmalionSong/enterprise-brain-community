// Cache correctness under current RLS, replacement and session revocation.
// 缓存遇到当前RLS、版本替换及会话撤销的正确性。
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase,withEnterprise} from '../src/db/adapter.ts';
import {migrate} from '../src/db/migrate.ts';
import {operatingSnapshot,operatingSnapshotBody} from '../src/core/workbench.ts';
import {createApplication} from '../src/http/server.ts';
import type {OperatingService} from '../src/core/operating-service.ts';
import {hash} from '../src/runtime/contracts.ts';
import {localFetch} from '../scripts/local-http.mjs';
const actor={id:randomUUID(),enterpriseId:randomUUID(),role:'executive',authorizationVersion:1};
async function fixture(){const db=await openDatabase(':memory:');await migrate(db,'migrations');return db;}
async function put(db:Awaited<ReturnType<typeof fixture>>,enterprise:string,payload:unknown){await db.query('INSERT INTO operating_snapshot VALUES($1,$2,$3,$4) ON CONFLICT(enterprise_id,id) DO UPDATE SET checksum=$3,payload=$4',[enterprise,'beverage-read-v1',hash(payload),JSON.stringify(payload)]);}
test('warm snapshot cannot cross enterprise or database boundaries; role and deletion still deny',async()=>{
 const db=await fixture(),other=await fixture();try{
 await put(db,actor.enterpriseId,{owner:'one'});await put(other,actor.enterpriseId,{owner:'other database'});
 assert.deepEqual((await operatingSnapshot(db,actor)).snapshot,{owner:'one'});
 assert.deepEqual((await operatingSnapshot(other,actor)).snapshot,{owner:'other database'});
 await assert.rejects(operatingSnapshot(db,{...actor,enterpriseId:randomUUID()}),/snapshot_unavailable/);
 await assert.rejects(operatingSnapshot(db,{...actor,role:'it'}),/business_access_denied/);
 await withEnterprise(db,randomUUID(),async tx=>{assert.equal((await tx.query('SELECT checksum FROM operating_snapshot')).rows.length,0);});
 await db.query('DELETE FROM operating_snapshot');await assert.rejects(operatingSnapshot(db,actor),/snapshot_unavailable/);
 }finally{await db.close();await other.close();}
});
test('warm snapshots are immutable and current replacement updates object and encoded response',async()=>{
 const db=await fixture();try{
 await put(db,actor.enterpriseId,{value:10,rows:[{amount:10}]});const old=await operatingSnapshot(db,actor);
 assert.throws(()=>{(old.snapshot as any).rows[0].amount=999;},TypeError);
 assert.equal((JSON.parse((await operatingSnapshotBody(db,actor)).toString()).snapshot).rows[0].amount,10);
 await put(db,actor.enterpriseId,{value:20,rows:[{amount:20}]});
 const next=await operatingSnapshot(db,actor);assert.notEqual(next.evidence.hash,old.evidence.hash);assert.equal((next.snapshot as any).value,20);
 assert.equal(JSON.parse((await operatingSnapshotBody(db,actor)).toString()).snapshot.value,20);assert.equal((old.snapshot as any).value,10);
 // Administrator correction must invalidate even if its checksum was not updated.
 // 管理员更正即便遗漏更新校验值，也必须失效旧缓存。
 await db.query('UPDATE operating_snapshot SET payload=$1 WHERE enterprise_id=$2',[JSON.stringify({value:30}),actor.enterpriseId]);
 assert.equal(((await operatingSnapshot(db,actor)).snapshot as any).value,30);
 }finally{await db.close();}
});
test('HTTP warm snapshot is no-store; revoked and disabled sessions cannot retrieve it',async()=>{
 const db=await fixture();let app:ReturnType<typeof createApplication>|undefined;try{
 await put(db,actor.enterpriseId,{value:'private'});
 await db.query("INSERT INTO enterprise(id,name,environment,currency,timezone) VALUES($1,'isolated cache acceptance','demo','CNY','Asia/Shanghai')",[actor.enterpriseId]);
 await db.query("INSERT INTO principal(id,enterprise_id,username,role) VALUES($1,$2,'cache-test','executive')",[actor.id,actor.enterpriseId]);
 app=createApplication(db,process.cwd(),'demo',undefined,{},undefined,undefined,{} as OperatingService);await new Promise<void>(ok=>app!.server.listen(0,'127.0.0.1',ok));
 const url='http://127.0.0.1:'+(app.server.address() as any).port+'/v1/operating/snapshot',s=await app.identity.createSession(actor.id),headers={cookie:'eb_session='+s.token};
 for(let i=0;i<2;i++){const r=await localFetch(url,{headers});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json() as any).snapshot.value,'private');}
 await app.identity.revoke(actor.id);const revoked=await localFetch(url,{headers});assert.equal(revoked.status,401);assert.ok(!(await revoked.text()).includes('private'));
 const newer=await app.identity.createSession(actor.id);await db.query('UPDATE principal SET disabled=true WHERE id=$1',[actor.id]);const disabled=await localFetch(url,{headers:{cookie:'eb_session='+newer.token}});assert.equal(disabled.status,401);assert.ok(!(await disabled.text()).includes('private'));
 }finally{if(app)await new Promise<void>(ok=>app!.server.close(()=>ok()));await db.close();}
});
