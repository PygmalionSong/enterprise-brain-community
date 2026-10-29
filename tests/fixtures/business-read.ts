// Constructed database state tests the guard, not a real source read or Graph bridge.
// 构造数据库状态验收守卫，不冒称源端读取或Graph桥接已验。
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './graph-runtime.ts';
import {DiscoveryStore} from '../../src/onboarding/discovery-store.ts';
import {MetadataConnections} from '../../src/onboarding/metadata-connections.ts';
import {inspectProtocolObservation} from '../../src/onboarding/protocol-observation.ts';
import {businessReadPolicy} from '../../src/onboarding/business-read-contracts.ts';
import {checkBusinessReadInTransaction} from '../../src/onboarding/business-read-guard.ts';
import {requireEnterpriseLock} from '../../src/db/enterprise-lock.ts';
import {BusinessReadGrants} from '../../src/onboarding/business-read-grants.ts';
import {BusinessReadService} from '../../src/onboarding/business-read-service.ts';
import {createServer} from 'node:http';
export async function setup(expired=false,location=':memory:',metadataEndpoint='http://127.0.0.1:19000/$metadata',metadataBody?:string){
 const f=await fixture(location),a=f.actors,it=a.it,store=new DiscoveryStore(f.db),metadata=new MetadataConnections(f.db,store);
 const scope=await store.createScope(it,{endpoints:[metadataEndpoint],idempotencyKey:randomUUID(),scopeAcknowledged:true});
 const run=await store.createRun(it,{scopeId:scope.id,expectedScopeVersion:1,idempotencyKey:randomUUID()}),claim=await store.claimNext(it,run.id);assert.ok(claim);
 const observed=inspectProtocolObservation({status:200,contentType:'application/json',body:metadataBody??JSON.stringify({$Version:'4.01',Owned:{Order:{$Kind:'EntityType',$Key:['Id'],Id:{$Type:'Edm.String',$Nullable:false}}}})});
 await store.accept(it,claim,observed);const view=await store.run(it,run.id),target=view.targets[0];
 const binding=await metadata.review(it,{evidenceId:target.evidenceId,expectedObservationSha256:target.observationSha256,systemName:'Owned',businessPurpose:'Orders',businessOwnerRole:'IT',identityAcknowledged:true,metadataReadAcknowledged:true,idempotencyKey:randomUUID()});
 // Explicit fixture seed; real read qualification is covered separately.
 await f.db.query("UPDATE onboarding_binding SET state='read_tested',version=2 WHERE id=$1",[binding.id]);
 const review=(await f.db.query<any>('SELECT review_id FROM onboarding_binding WHERE id=$1',[binding.id])).rows[0];
 const ref={id:it.id,version:1,role:'it' as const},policy=businessReadPolicy({format:'enterprise-brain.business-read-policy/1',enterpriseId:it.enterpriseId,scopeId:scope.id,scopeVersion:1,discoveryRunId:run.id,reviewId:review.review_id,reviewVersion:1,bindingId:binding.id,bindingVersion:2,owner:ref,reviewer:ref,policyReviewer:ref,metadataSha256:observed.rawSha256,adapter:'odata.projected-read.v1',endpoint:'http://127.0.0.1:19000/Orders',entity:'Orders',fields:['Id'],maxRows:10,maxBytes:4096,timeoutMs:1000,purpose:'Read order ids'}),policyId=randomUUID(),grantId=randomUUID();
 await f.db.query('INSERT INTO business_read_policy(enterprise_id,id,version,binding_id,reviewed_by,reviewer_version,policy,policy_sha) VALUES($1,$2,1,$3,$4,1,$5,$6)',[it.enterpriseId,policyId,binding.id,it.id,JSON.stringify(policy.policy),policy.sha256]);
 // Explicit constructed validation receipt for guard/lifecycle unit tests only.
 // 仅守卫/生命周期单测构造验证回执；实际来源路径另有HTTP验收。
 async function seedValidation(id:string){const row=(await f.db.query<any>('SELECT policy,policy_sha FROM business_read_policy WHERE id=$1',[id])).rows[0];await f.db.query('INSERT INTO business_policy_validation(enterprise_id,policy_id,policy_version,policy_sha,metadata_sha,metadata_endpoint) VALUES($1,$2,1,$3,$4,$5)',[it.enterpriseId,id,row.policy_sha,row.policy.metadataSha256,metadataEndpoint]);}
 await seedValidation(policyId);
 await f.db.query("INSERT INTO business_read_grant(enterprise_id,id,version,policy_id,policy_version,policy_sha,approved_by,approver_version,purpose,created_at,expires_at) VALUES($1,$2,1,$3,1,$4,$5,1,$6,clock_timestamp()-interval '2 hours',clock_timestamp()+$7*interval '1 second')",[it.enterpriseId,grantId,policyId,policy.sha256,a.executive.id,policy.policy.purpose,expired?-3600:300]);
 const proof={grantId,grantVersion:1,policyId,policyVersion:1,policySha256:policy.sha256,policy:policy.policy,approver:{id:a.executive.id,version:1,role:'business' as const}};
 async function check(missing=false){return f.db.transaction(async tx=>{
  const locked=new Map<string,{version:number;role:string;disabled:boolean}>();
  for(const actor of [it,a.executive,a.operations].sort((x,y)=>x.id.localeCompare(y.id))){const row=(await tx.query<any>('SELECT * FROM principal WHERE id=$1 FOR SHARE',[actor.id])).rows[0];locked.set(actor.id,{version:Number(row.authorization_version),role:row.role,disabled:row.disabled});}
  await requireEnterpriseLock(tx,it.enterpriseId);await tx.exec('SET LOCAL ROLE eb_app');await tx.query("SELECT set_config('app.enterprise_id',$1,true)",[it.enterpriseId]);if(missing)locked.delete(it.id);
  return checkBusinessReadInTransaction(tx,a.operations,proof,locked);
 });}
 return {...f,proof,check,scope,seedValidation};
}
