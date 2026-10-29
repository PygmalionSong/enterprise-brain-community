// Actual SQL transactions/migrations; no enterprise endpoints or model APIs.
// 实际SQL事务和迁移，不访问企业端点或模型服务。
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {openDatabase,withEnterprise,type Database} from '../src/db/adapter.ts';
import {migrate} from '../src/db/migrate.ts';
import {readSchemaInventory} from '../src/db/schema-health.ts';
import type {Actor} from '../src/identity/service.ts';
import {DiscoveryStore} from '../src/onboarding/discovery-store.ts';
import {inspectProtocolObservation} from '../src/onboarding/protocol-observation.ts';
import {hiddenEnterprise} from './fixtures/enterprise-lock.ts';

let db:Database,store:DiscoveryStore;
const enterprise=randomUUID(),otherEnterprise=randomUUID();
const it:Actor={id:randomUUID(),enterpriseId:enterprise,role:'it',authorizationVersion:1};
const colleague:Actor={id:randomUUID(),enterpriseId:enterprise,role:'it',authorizationVersion:1};
const outsider:Actor={id:randomUUID(),enterpriseId:otherEnterprise,role:'it',authorizationVersion:1};
const business:Actor={id:randomUUID(),enterpriseId:enterprise,role:'executive',authorizationVersion:1};
const endpoint='http://127.0.0.1:19001/$metadata';
const observation=inspectProtocolObservation({status:200,contentType:'application/json',body:JSON.stringify({$Version:'4.01',Owned:{Row:{$Kind:'EntityType',$Key:['Id'],Id:{$Type:'Edm.String',$Nullable:false}}}})});
before(async()=>{
  db=await openDatabase(':memory:');await migrate(db,join(process.cwd(),'migrations'));
  for(const id of [enterprise,otherEnterprise])await db.query("INSERT INTO enterprise(id,name,environment,currency,timezone) VALUES($1,'Owned onboarding','enterprise','CNY','UTC')",[id]);
  for(const actor of [it,colleague,outsider,business])await db.query('INSERT INTO principal(id,enterprise_id,username,role) VALUES($1,$2,$3,$4)',[actor.id,actor.enterpriseId,'owned-'+actor.id,actor.role]);
  store=new DiscoveryStore(db);
});
after(async()=>{await db?.close();});
async function setup(endpoints=[endpoint],instance=store,actor=it){
  const scope=await instance.createScope(actor,{endpoints,ttlSeconds:900,idempotencyKey:randomUUID(),scopeAcknowledged:true});
  const run=await instance.createRun(actor,{scopeId:scope.id,expectedScopeVersion:scope.version,idempotencyKey:randomUUID()});
  return {scope,run};
}
async function count(runId:string){return Number((await db.query<{n:number}>('SELECT count(*) n FROM onboarding_evidence WHERE run_id=$1',[runId])).rows[0].n);}
test('migration029 is real and repeatable / 实际029迁移可重复核对',async()=>{
  assert.equal(Number((await db.query<{n:number}>('SELECT count(*) n FROM schema_migration')).rows[0].n),(await readSchemaInventory('migrations')).length);
  assert.deepEqual(await migrate(db,join(process.cwd(),'migrations')),[]);
});
test('scope retries do not silently renew or resurrect grants / 范围重试不续期不复活',async()=>{
  const input={endpoints:[endpoint],ttlSeconds:900,idempotencyKey:randomUUID(),scopeAcknowledged:true};
  const a=await store.createScope(it,input),b=await store.createScope(it,input);
  assert.equal(a.id,b.id);assert.equal(b.created,false);assert.equal(a.expiresAt,b.expiresAt);
  await assert.rejects(store.createScope(it,{...input,ttlSeconds:1000}),/idempotency_conflict/);
  await store.revoke(it,a.id,a.version);const again=await store.createScope(it,input);
  assert.equal(again.id,a.id);assert.equal(again.active,false);assert.equal(again.revoked,true);
});
test('scope requires IT and explicit acknowledgement / 范围需要IT及明确确认',async()=>{
  const input={endpoints:[endpoint],idempotencyKey:randomUUID(),scopeAcknowledged:true};
  await assert.rejects(store.createScope(business,input));
  await assert.rejects(store.createScope(it,{...input,scopeAcknowledged:false}));
  await assert.rejects(store.createScope({...it,authorizationVersion:2},input),/not_authorized/);
});
test('unsupported hosts finish with zero evidence and no connection / 未支持主机无证据也非连接',async()=>{
  const {run}=await setup(['http://owned.invalid/$metadata']);assert.equal(await store.claimNext(it,run.id),null);
  const status=await store.run(it,run.id);assert.equal(status.state,'completed');assert.equal(status.targets[0].state,'unsupported');
  assert.equal(status.connected,false);assert.equal(status.readAuthorized,false);assert.equal(await count(run.id),0);
});
test('one claim commits once and returns the original receipt on retry / 同一领取提交一次并找回原回执',async()=>{
  const {run}=await setup();const claim=await store.claimNext(it,run.id);assert.ok(claim);
  const first=await store.accept(it,claim,observation),again=await store.accept(it,claim,observation);
  assert.equal(first.id,again.id);assert.equal(again.recovered,true);assert.equal(await count(run.id),1);
  const status=await store.run(it,run.id);assert.equal(status.state,'completed');assert.equal(status.targets[0].observation.executable,false);
  await assert.rejects(store.accept(it,claim,{...observation,rawSha256:'b'.repeat(64)}),/discovery_evidence_conflict/);
});
test('scope revocation before commit refuses and redacts observations / 撤权先提交拒绝并隐藏观察',async()=>{
  const {scope,run}=await setup();const claim=await store.claimNext(it,run.id);assert.ok(claim);
  await store.revoke(it,scope.id,scope.version);
  await assert.rejects(store.accept(it,claim,observation),/discovery_authority_unavailable/);
  assert.equal(await count(run.id),0);const status=await store.run(it,run.id);
  assert.equal(status.scopeActive,false);assert.equal(status.targets[0].endpoint,undefined);assert.equal(status.targets[0].observation,undefined);
  assert.equal(await store.claimNext(it,run.id).catch(()=>null),null);
});
test('cancelled run refuses an already returned response / 取消任务拒绝已返回响应',async()=>{
  const {run}=await setup();const claim=await store.claimNext(it,run.id);assert.ok(claim);
  await store.cancel(it,run.id,run.version);await assert.rejects(store.accept(it,claim,observation),/discovery_claim_stale/);
  assert.equal(await count(run.id),0);
});
test('another valid scope cannot launder a claim / 其他有效范围不能洗白领取',async()=>{
  const one=await setup(),two=await setup();const claim=await store.claimNext(it,one.run.id);assert.ok(claim);
  await assert.rejects(store.accept(it,{...claim,scopeId:two.scope.id},observation),/discovery_claim_stale/);
  assert.equal(await count(one.run.id),0);
});
test('account-version changes invalidate work while another IT can cancel / 账号版本变化使工作失效',async()=>{
  const {run}=await setup();const claim=await store.claimNext(it,run.id);assert.ok(claim);
  try{
    await db.query('UPDATE principal SET authorization_version=2 WHERE id=$1',[it.id]);
    await assert.rejects(store.accept(it,claim,observation),/not_authorized/);
    const stopped=await store.cancel(colleague,run.id,run.version);assert.equal(stopped.state,'cancelled');
    assert.equal((await store.run(colleague,run.id)).scopeActive,false);
  }finally{await db.query('UPDATE principal SET authorization_version=1 WHERE id=$1',[it.id]);}
});
test('tenant and requester checks remain independent / 企业及原请求人分别校验',async()=>{
  const {scope,run}=await setup();await assert.rejects(store.scope(outsider,scope.id),/not_found/);
  await assert.rejects(store.run(outsider,run.id),/not_found/);await assert.rejects(store.claimNext(colleague,run.id),/discovery_actor_changed/);
});
test('four active claims cap concurrent dispatch with no implicit retries / 并发领取上限四且不隐式重试',async()=>{
  const {run}=await setup(Array.from({length:5},(_,i)=>'http://127.0.0.1:19001/metadata/'+i));
  const claims=[];for(let i=0;i<4;i++){const c=await store.claimNext(it,run.id);assert.ok(c);claims.push(c);}
  assert.equal(await store.claimNext(it,run.id),null);await store.unavailable(it,claims[0],'ECONNREFUSED');
  const last=await store.claimNext(it,run.id);assert.ok(last);assert.ok(!claims.some(c=>c.assetId===last.assetId));
  assert.equal(await store.claimNext(it,run.id),null);await store.cancel(it,run.id,1);
});
test('a new process identity cannot take over an issued run / 新工作器身份不接管已派发任务',async()=>{
  const {run}=await setup();const claim=await store.claimNext(it,run.id);assert.ok(claim);
  const restarted=new DiscoveryStore(db);assert.equal((await restarted.run(it,run.id)).needsRecovery,true);
  await assert.rejects(restarted.claimNext(it,run.id),/discovery_worker_changed/);
  await restarted.cancel(colleague,run.id,1,true);await assert.rejects(store.accept(it,claim,observation),/discovery_claim_stale/);
  assert.equal(await restarted.claimNext(it,run.id),null);
});
test('failed audit rolls evidence and target state back atomically / 审计失败原子回滚证据及目标',async()=>{
  const bad:Database={...db,transaction:fn=>db.transaction(tx=>fn({
    exec:s=>tx.exec(s),query:async(s,p)=>{if(s.startsWith('INSERT INTO audit_event')&&p?.includes('onboarding_evidence_accepted'))throw Error('owned_audit_failure');return tx.query(s,p);},
  }))};
  const failing=new DiscoveryStore(bad),{run}=await setup([endpoint],failing);const claim=await failing.claimNext(it,run.id);assert.ok(claim);
  await assert.rejects(failing.accept(it,claim,observation),/owned_audit_failure/);assert.equal(await count(run.id),0);
  assert.equal((await failing.run(it,run.id)).targets[0].state,'issued');
  // Reconcile the same in-memory result under the same worker identity, never rescan.
  // 用原工作器和同一内存结果查证，不重新扫描。
  await failing.unavailable(it,claim,'discovery_transport_unavailable');
});
test('hidden enterprise parent is not accepted as a successful lock / 企业父行不可见不当成功加锁',async()=>{
  const {scope}=await setup(),hidden=hiddenEnterprise(db),isolated=new DiscoveryStore(hidden.db);
  await assert.rejects(isolated.scope(it,scope.id),/not_authorized/);assert.ok(hidden.trace.parentAttempts>0);
});
test('untrusted authority fields and raw payloads cannot be stored / 不保存越权字段及原始载荷',async()=>{
  const {run}=await setup();const claim=await store.claimNext(it,run.id);assert.ok(claim);
  for(const input of [{...observation,executable:true},{...observation,confirmed:true},{...observation,rawContent:'PRIVATE'},
    {...observation,outcome:'unknown'}])await assert.rejects(store.accept(it,claim,input));
  assert.equal(await count(run.id),0);await store.cancel(it,run.id,1);
});
test('evidence is immutable and cross-tenant foreign keys hold / 证据不可改且外键隔离企业',async()=>{
  const {run}=await setup(),claim=await store.claimNext(it,run.id);assert.ok(claim);const receipt=await store.accept(it,claim,observation);
  await assert.rejects(db.query('UPDATE onboarding_evidence SET observation_sha=$2 WHERE id=$1',[receipt.id,'c'.repeat(64)]),/onboarding_record_immutable/);
  await assert.rejects(withEnterprise(db,otherEnterprise,tx=>tx.query('INSERT INTO onboarding_run(enterprise_id,id,scope_id,scope_version,requested_by,requester_version,idempotency_key,state,created_at,deadline) VALUES($1,$2,$3,1,$4,1,$5,\'authorized\',clock_timestamp(),clock_timestamp()+interval \'1 minute\')',[otherEnterprise,randomUUID(),claim.scopeId,outsider.id,randomUUID()])));
});
