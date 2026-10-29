// Product Sql helper checks; full archive/controller tests are separate.
// 产品Sql函数检查；完整归档及控制器验收另行进行。
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {setup} from './fixtures/business-read.ts';import {DiscoveryStore} from '../src/onboarding/discovery-store.ts';import {hash} from '../src/runtime/contracts.ts';
import {freezeRestoredReadAuthority} from '../src/enterprise/restored-read-authority.ts';
import {readSchemaInventory} from '../src/db/schema-health.ts';import {fenceNativeEnterpriseAuthority} from '../src/enterprise/native-authority-fence.ts';
import type {Database} from '../src/db/adapter.ts';
const expected=await readSchemaInventory('migrations');
async function freezeNewAuthorityReference(tx:any,enterprise:string){const result=await freezeRestoredReadAuthority(tx,enterprise,expected);await tx.query("INSERT INTO audit_event(enterprise_id,id,kind,details) VALUES($1,gen_random_uuid(),'product_freeze_test',$2)",[enterprise,JSON.stringify(result)]);return result;}

test('product freeze obeys actual triggers, is monotonic and retains completed evidence/receipts',async()=>{
 const f=await setup();try{
  const it=f.actors.it,store=new DiscoveryStore(f.db),run=await store.createRun(it,{scopeId:f.scope.id,expectedScopeVersion:1,idempotencyKey:randomUUID()});await store.claimNext(it,run.id);
  const issued=randomUUID(),completed=randomUUID(),projection=[{Id:'keep-original'}];
  for(const [reference,state]of [[issued,'issued'],[completed,'completed']])await f.db.query('INSERT INTO business_read_receipt(enterprise_id,reference,grant_id,grant_version,policy_sha,requested_by,requester_version,state,deadline,projection,projection_sha,completed_at) VALUES($1,$2,$3,1,$4,$5,1,$6,clock_timestamp()+interval \'1 minute\',$7,$8,$9)',[it.enterpriseId,reference,f.proof.grantId,f.proof.policySha256,f.actors.operations.id,state,state==='completed'?JSON.stringify(projection):null,state==='completed'?hash(projection):null,state==='completed'?new Date():null]);
  for(const state of ['issued','passed'])await f.db.query('INSERT INTO onboarding_read_test(enterprise_id,id,binding_id,binding_version,review_version,requested_by,requester_version,idempotency_key,state,deadline) VALUES($1,$2,$3,2,1,$4,1,$5,$6,clock_timestamp()+interval \'1 minute\')',[it.enterpriseId,randomUUID(),f.proof.policy.bindingId,it.id,randomUUID(),state]);
  const snap=async()=>({evidence:(await f.db.query('SELECT * FROM onboarding_evidence ORDER BY id')).rows,receipts:(await f.db.query("SELECT * FROM business_read_receipt WHERE state='completed'")).rows,validation:(await f.db.query('SELECT * FROM business_policy_validation ORDER BY policy_id')).rows,completedReadTests:(await f.db.query("SELECT * FROM onboarding_read_test WHERE state='passed' ORDER BY id")).rows});const before=await snap();
  const counts=await f.db.transaction(tx=>freezeNewAuthorityReference(tx,it.enterpriseId));assert.equal(counts.grants,1);assert.equal(counts.receipts,1);assert.equal(counts.runs,1);assert.equal(counts.targets,1);assert.equal(counts.readTests,1);assert.deepEqual(await snap(),before);
  assert.equal((await f.db.query<any>('SELECT state FROM onboarding_run WHERE id=$1',[run.id])).rows[0].state,'unknown');
  assert.equal((await f.db.query<any>('SELECT state FROM business_read_receipt WHERE reference=$1',[issued])).rows[0].state,'unknown');await assert.rejects(f.check());
  const again=await f.db.transaction(tx=>freezeNewAuthorityReference(tx,it.enterpriseId));assert.ok(Object.values(again).every(value=>value===0));assert.deepEqual(await snap(),before);
 }finally{await f.close();}
});
test('audit failure rolls every new-authority update back; other enterprise is untouched',async()=>{
 const f=await setup();try{
  const snapshot=async()=>({scope:(await f.db.query('SELECT * FROM onboarding_scope')).rows,grant:(await f.db.query('SELECT * FROM business_read_grant')).rows,policy:(await f.db.query('SELECT * FROM business_read_policy')).rows});const before=await snapshot();
  await assert.rejects(f.db.transaction(tx=>freezeNewAuthorityReference({query:async(sql:string,args:unknown[])=>{if(sql.startsWith('INSERT INTO audit_event'))throw Error('injected_audit_failure');return tx.query(sql,args);}},f.actors.it.enterpriseId)),/injected_audit_failure/);assert.deepEqual(await snapshot(),before);assert.ok(await f.check());
  const another=randomUUID();await f.db.query("INSERT INTO enterprise VALUES($1,'Other','enterprise','CNY','UTC')",[another]);await f.db.transaction(tx=>freezeNewAuthorityReference(tx,another));assert.deepEqual(await snapshot(),before);
 }finally{await f.close();}
});

test('product fence rejects mismatched schema before changing authority',async()=>{const f=await setup();try{await assert.rejects(f.db.transaction(tx=>freezeRestoredReadAuthority(tx,f.actors.it.enterpriseId,expected.slice(0,28))),/schema_mismatch/);assert.ok(await f.check());}finally{await f.close();}});
test('shared full-domain fence does not renew authority and works in one caller-owned transaction',async()=>{const f=await setup();try{await f.db.transaction(async tx=>{const shared:Database={profile:f.db.profile,query:(sql,args)=>tx.query(sql,args),exec:sql=>tx.exec(sql),transaction:fn=>fn(shared),close:async()=>{throw Error('not_owned');}};const result=await fenceNativeEnterpriseAuthority(shared,f.actors.it.enterpriseId,expected);assert.equal(result.restoredReadAuthority.grants,1);await tx.query("INSERT INTO audit_event(enterprise_id,id,kind,details) VALUES($1,gen_random_uuid(),'full_product_freeze_test',$2)",[f.actors.it.enterpriseId,JSON.stringify(result)]);});await assert.rejects(f.check());}finally{await f.close();}});
