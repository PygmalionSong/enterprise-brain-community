// Constructed database state tests the guard, not a real source read or Graph bridge.
// 构造数据库状态验收守卫，不冒称源端读取或Graph桥接已验。
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './fixtures/graph-runtime.ts';
import {DiscoveryStore} from '../src/onboarding/discovery-store.ts';
import {MetadataConnections} from '../src/onboarding/metadata-connections.ts';
import {inspectProtocolObservation} from '../src/onboarding/protocol-observation.ts';
import {businessReadPolicy} from '../src/onboarding/business-read-contracts.ts';
import {checkBusinessReadInTransaction} from '../src/onboarding/business-read-guard.ts';
import {requireEnterpriseLock} from '../src/db/enterprise-lock.ts';
import {BusinessReadGrants} from '../src/onboarding/business-read-grants.ts';
import {BusinessReadService} from '../src/onboarding/business-read-service.ts';
import {createServer} from 'node:http';
import {setup} from './fixtures/business-read.ts';
test('same-transaction guard validates exact constructed authority and requires declared prelocks',async()=>{const f=await setup();try{assert.equal((await f.check()).sha256,f.proof.policySha256);await assert.rejects(f.check(true),/principal_not_locked/);}finally{await f.close();}});
test('revoked business grants cannot be renewed or used',async()=>{const f=await setup();try{await f.db.query('UPDATE business_read_grant SET revoked=true,version=2 WHERE id=$1',[f.proof.grantId]);await assert.rejects(f.check(),/grant_changed/);await assert.rejects(f.db.query('UPDATE business_read_grant SET revoked=false,version=3 WHERE id=$1',[f.proof.grantId]),/immutable/);}finally{await f.close();}});
test('scope revocation is independent of business approval',async()=>{const f=await setup();try{await new DiscoveryStore(f.db).revoke(f.actors.it,f.scope.id,1);await assert.rejects(f.check(),/scope_changed/);}finally{await f.close();}});
test('expired business grant fails despite valid connection and scope',async()=>{const f=await setup(true);try{await assert.rejects(f.check(),/business_read_expired/);}finally{await f.close();}});
test('IT reviews the exact endpoint policy; independent business actor approves and revokes',async()=>{const f=await setup();try{
 const grants=new BusinessReadGrants(f.db),policy=await grants.reviewPolicy(f.actors.it,{policy:f.proof.policy,endpointAndFieldsAcknowledged:true});assert.equal(policy.businessAuthorized,false);
 await assert.rejects(grants.reviewPolicy(f.actors.operations,{policy:f.proof.policy,endpointAndFieldsAcknowledged:true}),/not_authorized/);
 const input={expectedVersion:1,policySha256:policy.sha256,businessReadAcknowledged:true};await assert.rejects(grants.approve(f.actors.it,policy.id,input),/not_authorized/);
 await assert.rejects(grants.approve(f.actors.executive,policy.id,input),/policy_not_validated/);await f.seedValidation(policy.id);
 const grant=await grants.approve(f.actors.executive,policy.id,input);f.proof.policyId=policy.id;f.proof.grantId=grant.id;assert.equal((await f.check()).sha256,policy.sha256);
 await grants.revoke(f.actors.executive,grant.id,grant.version);await assert.rejects(f.check(),/grant_changed/);
}finally{await f.close();}});
test('business approval neither revives a revoked scope nor accepts another policy digest',async()=>{const f=await setup();try{
 const grants=new BusinessReadGrants(f.db),policy=await grants.reviewPolicy(f.actors.it,{policy:f.proof.policy,endpointAndFieldsAcknowledged:true});
 await assert.rejects(grants.approve(f.actors.executive,policy.id,{expectedVersion:1,policySha256:'f'.repeat(64),businessReadAcknowledged:true}),/policy_changed/);
 await new DiscoveryStore(f.db).revoke(f.actors.it,f.scope.id,1);await assert.rejects(grants.approve(f.actors.executive,policy.id,{expectedVersion:1,policySha256:policy.sha256,businessReadAcknowledged:true}),/scope_changed/);
}finally{await f.close();}});
test('actual source read persists one original receipt; reopening service and retry do not GET again',async()=>{
 const f=await setup();let hits=0;const source=createServer((_req,res)=>{hits++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({value:[{Id:'real-owned-row',Secret:'unapproved'}]}));});
 try{await new Promise<void>(ok=>source.listen(0,'127.0.0.1',ok));const grants=new BusinessReadGrants(f.db),policy=await grants.reviewPolicy(f.actors.it,{policy:{...f.proof.policy,endpoint:'http://127.0.0.1:'+(source.address() as any).port+'/Orders'},endpointAndFieldsAcknowledged:true});
 await f.seedValidation(policy.id);const grant=await grants.approve(f.actors.executive,policy.id,{expectedVersion:1,policySha256:policy.sha256,businessReadAcknowledged:true}),proof=await grants.proof(f.actors.operations,grant.id),ref=randomUUID();
 const first=await new BusinessReadService(grants).submit(f.actors.operations,proof,ref);assert.equal(first.state,'completed');assert.equal(hits,1);assert.deepEqual(first.data,{rows:[{Id:'real-owned-row'}]});
 const reopened=new BusinessReadService(new BusinessReadGrants(f.db));assert.deepEqual(await reopened.lookup(f.actors.operations,proof,ref),first);assert.deepEqual(await reopened.submit(f.actors.operations,proof,ref),first);assert.equal(hits,1);
 await grants.revoke(f.actors.executive,grant.id,1);await assert.rejects(reopened.lookup(f.actors.operations,proof,ref),/grant_changed/);assert.equal(hits,1);
 }finally{source.closeAllConnections();await new Promise<void>(ok=>source.close(()=>ok()));await f.close();}
});
