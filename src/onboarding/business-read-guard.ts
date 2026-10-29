// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Called only inside the caller-owned transaction after sorted principal locks
// and the exact enterprise parent. Never opens a transaction or sends HTTP.
// 仅在调用方已按序锁定全部身份和准确企业父行的事务内调用，不另开事务、不发HTTP。
import type {Sql} from '../db/adapter.ts';
import type {Actor} from '../identity/service.ts';
import {businessReadPolicy,businessReadDelegates,type BusinessReadPolicy} from './business-read-contracts.ts';
type Principal={id:string;version:number;role:'it'|'business'};
export type BusinessReadProof={grantId:string;grantVersion:number;policyId:string;policyVersion:number;policySha256:string;policy:BusinessReadPolicy;approver:Principal};
export type LockedReadPrincipals=ReadonlyMap<string,{version:number;role:string;disabled:boolean}>;
export async function checkBusinessReadSourceInTransaction(tx:Sql,actor:Actor,input:BusinessReadPolicy,lockedPrincipals:LockedReadPrincipals){
 const frozen=businessReadPolicy(input);if(frozen.policy.enterpriseId!==actor.enterpriseId)throw Error('business_read_proof_changed');
 for(const ref of businessReadDelegates(frozen.policy)){
  const p=lockedPrincipals.get(ref.id);if(!p||p.disabled!==false||p.role!=='it'||p.version!==ref.version)throw Error('business_read_principal_not_locked');
 }
 const p=frozen.policy;
 const scope=(await tx.query<any>('SELECT * FROM onboarding_scope WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[actor.enterpriseId,p.scopeId])).rows[0];
 if(!scope||scope.revoked||Number(scope.version)!==p.scopeVersion||scope.owner_id!==p.owner.id||Number(scope.owner_version)!==p.owner.version)throw Error('business_read_scope_changed');
 const run=(await tx.query<any>('SELECT scope_id FROM onboarding_run WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[actor.enterpriseId,p.discoveryRunId])).rows[0];
 if(run?.scope_id!==p.scopeId)throw Error('business_read_run_changed');
 const review=(await tx.query<any>('SELECT * FROM onboarding_review WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[actor.enterpriseId,p.reviewId])).rows[0];
 const binding=(await tx.query<any>('SELECT * FROM onboarding_binding WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[actor.enterpriseId,p.bindingId])).rows[0];
 if(!review||review.revoked||Number(review.version)!==p.reviewVersion||review.reviewed_by!==p.reviewer.id||Number(review.reviewer_version)!==p.reviewer.version||!binding||binding.state!=='read_tested'||Number(binding.version)!==p.bindingVersion||binding.review_id!==p.reviewId||Number(binding.review_version)!==p.reviewVersion||binding.adapter_id!=='odata.metadata'||binding.adapter_version!=='1'||binding.secret_ref!==null)throw Error('business_read_connection_changed');
 const evidence=(await tx.query<any>('SELECT run_id,observation FROM onboarding_evidence WHERE enterprise_id=$1 AND id=$2',[actor.enterpriseId,review.evidence_id])).rows[0];
 if(evidence?.run_id!==p.discoveryRunId||evidence?.observation?.rawSha256!==p.metadataSha256)throw Error('business_read_metadata_changed');
 const live=(await tx.query<any>('SELECT clock_timestamp()<$1::timestamptz live',[scope.expires_at])).rows[0];if(!live?.live)throw Error('business_read_expired');return {frozen,scope};
}
export async function checkBusinessReadInTransaction(tx:Sql,actor:Actor,proof:BusinessReadProof,lockedPrincipals:ReadonlyMap<string,{version:number;role:string;disabled:boolean}>){
 if(!['executive','operations'].includes(actor.role))throw Error('not_authorized');
 const frozen=businessReadPolicy(proof.policy);if(frozen.policy.enterpriseId!==actor.enterpriseId||frozen.sha256!==proof.policySha256)throw Error('business_read_proof_changed');
 for(const ref of [...businessReadDelegates(frozen.policy,proof.approver),{id:actor.id,version:actor.authorizationVersion,role:'business' as const}]){
  // Host-role prelocks retain current identity snapshots until transaction end.
  // 宿主角色的前置SHARE锁使身份快照保持到事务结束；不向eb_app扩展身份表权限。
  const locked=lockedPrincipals.get(ref.id);if(!locked||locked.disabled!==false||locked.version!==ref.version||!(ref.role==='it'?locked.role==='it':['executive','operations'].includes(locked.role)))throw Error('business_read_principal_not_locked');
 }
 const {scope}=await checkBusinessReadSourceInTransaction(tx,actor,frozen.policy,lockedPrincipals);const p=frozen.policy;
 const policy=(await tx.query<any>('SELECT * FROM business_read_policy WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[actor.enterpriseId,proof.policyId])).rows[0];
 if(!policy||policy.revoked||Number(policy.version)!==proof.policyVersion||policy.policy_sha!==frozen.sha256||businessReadPolicy(policy.policy).sha256!==frozen.sha256||policy.binding_id!==p.bindingId||policy.reviewed_by!==p.policyReviewer.id||Number(policy.reviewer_version)!==p.policyReviewer.version)throw Error('business_read_policy_changed');
 const validated=(await tx.query<any>('SELECT * FROM business_policy_validation WHERE policy_id=$1',[proof.policyId])).rows[0];if(!validated||Number(validated.policy_version)!==proof.policyVersion||validated.policy_sha!==frozen.sha256||validated.metadata_sha!==p.metadataSha256)throw Error('business_read_policy_not_validated');
 const grant=(await tx.query<any>('SELECT * FROM business_read_grant WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[actor.enterpriseId,proof.grantId])).rows[0];
 if(!grant||grant.revoked||Number(grant.version)!==proof.grantVersion||grant.policy_id!==proof.policyId||Number(grant.policy_version)!==proof.policyVersion||grant.policy_sha!==proof.policySha256||grant.approved_by!==proof.approver.id||Number(grant.approver_version)!==proof.approver.version||grant.purpose!==p.purpose)throw Error('business_read_grant_changed');
 // Check the database clock after every potentially blocking lock.
 // 所有可能等待的锁之后再查数据库当前时钟。
 const live=(await tx.query<any>('SELECT clock_timestamp()<$1::timestamptz AND clock_timestamp()<$2::timestamptz live',[scope.expires_at,grant.expires_at])).rows[0];
 if(!live?.live)throw Error('business_read_expired');
 return frozen;
}
