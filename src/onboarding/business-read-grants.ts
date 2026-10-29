// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Independent IT policy review and business approval. Never invokes a tool.
// 独立IT政策核对与业务批准，绝不调用工具。
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Database,Sql} from '../db/adapter.ts';import {withEnterprise} from '../db/adapter.ts';
import type {Actor} from '../identity/service.ts';import {requireEnterpriseLock} from '../db/enterprise-lock.ts';
import {businessReadPolicy,businessReadDelegates} from './business-read-contracts.ts';
import {checkBusinessReadSourceInTransaction,checkBusinessReadInTransaction,type BusinessReadProof,type LockedReadPrincipals} from './business-read-guard.ts';
import {readBusinessPolicyMetadata} from './business-metadata-http.ts';
const version=z.number().int().positive(),uuid=z.uuid();
export class BusinessReadGrants{
 private db:Database;constructor(db:Database){this.db=db;}
 private activeSourceReviews=0;
 async policies(actor:Actor){
  if(!['it','executive','operations'].includes(actor.role))throw Error('not_authorized');
  const ids=await withEnterprise(this.db,actor.enterpriseId,async tx=>(await tx.query<any>('SELECT id FROM business_read_policy ORDER BY created_at DESC,id DESC LIMIT 50')).rows);
  await this.tx(actor,[],async()=>{});const result=[];
  for(const row of ids){try{result.push(await this.describePolicy(actor,row.id));}catch(error){if(!/^(business_read_|not_found)/.test((error as Error).message))throw error;}}
  return result;
 }
 async describePolicy(actor:Actor,id:string){
  uuid.parse(id);if(!['it','executive','operations'].includes(actor.role))throw Error('not_authorized');
  const row=await withEnterprise(this.db,actor.enterpriseId,async tx=>(await tx.query<any>('SELECT * FROM business_read_policy WHERE id=$1',[id])).rows[0]);if(!row)throw Error('not_found');const f=businessReadPolicy(row.policy);
  return this.tx(actor,businessReadDelegates(f.policy),async(tx,locked)=>{
   await checkBusinessReadSourceInTransaction(tx,actor,f.policy,locked);const current=(await tx.query<any>('SELECT * FROM business_read_policy WHERE id=$1 FOR SHARE',[id])).rows[0];if(!current||current.revoked||Number(current.version)!==Number(row.version)||current.policy_sha!==f.sha256)throw Error('business_read_policy_changed');
   const validation=(await tx.query<any>('SELECT policy_sha,metadata_sha FROM business_policy_validation WHERE policy_id=$1',[id])).rows[0];
   const grants=actor.role==='it'?[]:(await tx.query<any>('SELECT id,version,expires_at FROM business_read_grant WHERE policy_id=$1 AND NOT revoked AND expires_at>clock_timestamp() AND (approved_by=$2 OR $3::boolean) ORDER BY created_at DESC LIMIT 20',[id,actor.id,actor.role==='executive'])).rows.map(g=>({id:g.id,version:Number(g.version),expiresAt:new Date(g.expires_at).toISOString()}));
   return {id,version:Number(current.version),sha256:f.sha256,purpose:f.policy.purpose,entity:f.policy.entity,fields:f.policy.fields,maxRows:f.policy.maxRows,grants,metadataValidated:validation?.policy_sha===f.sha256&&validation?.metadata_sha===f.policy.metadataSha256,...(actor.role==='it'?{endpoint:f.policy.endpoint}:{}),businessAuthorized:false};
  });
 }
 async reviewPolicyFromSource(actor:Actor,input:unknown,signal?:AbortSignal){
  if(actor.role!=='it')throw Error('not_authorized');
  if(this.activeSourceReviews>=4)throw Error('business_read_review_capacity');
  this.activeSourceReviews++;try{return await this.validatePolicyFromSource(actor,input,signal);}finally{this.activeSourceReviews--;}
 }
 private async validatePolicyFromSource(actor:Actor,input:unknown,signal?:AbortSignal){
  if(actor.role!=='it')throw Error('not_authorized');const q=z.object({policy:z.unknown(),endpointAndFieldsAcknowledged:z.literal(true)}).strict().parse(input),f=businessReadPolicy(q.policy);
  if(f.policy.policyReviewer.id!==actor.id||f.policy.policyReviewer.version!==actor.authorizationVersion)throw Error('not_authorized');
  const checkSource=()=>this.tx(actor,businessReadDelegates(f.policy),async(tx,locked)=>{
   await checkBusinessReadSourceInTransaction(tx,actor,f.policy,locked);
   const row=(await tx.query<any>('SELECT a.endpoint FROM onboarding_review v JOIN onboarding_evidence e ON e.enterprise_id=v.enterprise_id AND e.id=v.evidence_id JOIN onboarding_asset a ON a.enterprise_id=e.enterprise_id AND a.id=e.asset_id WHERE v.id=$1',[f.policy.reviewId])).rows[0];if(!row)throw Error('business_read_metadata_missing');return String(row.endpoint);
  });
  const endpoint=await checkSource(),result=await readBusinessPolicyMetadata(f.policy,endpoint,{check:async(current)=>{if(current!==endpoint||await checkSource()!==endpoint)throw Error('business_read_metadata_changed');}},signal);
  if(result.status!=='validated')throw Error('business_read_metadata_validation_failed');
  if(result.validation.policySha256!==f.sha256||result.validation.metadataSha256!==f.policy.metadataSha256)throw Error('business_read_metadata_changed');
  // Final transaction rechecks source identity/versions before persisting the policy.
  // 最终持久化事务重新核验来源身份/版本，不跨网络持锁。
  const saved=await this.persistPolicy(actor,input,endpoint);return {...saved,metadataValidated:true};
 }
 async proof(actor:Actor,id:string):Promise<BusinessReadProof>{
  uuid.parse(id);if(!['executive','operations'].includes(actor.role))throw Error('not_authorized');
  return withEnterprise(this.db,actor.enterpriseId,async tx=>{const g=(await tx.query<any>('SELECT * FROM business_read_grant WHERE id=$1',[id])).rows[0];if(!g)throw Error('not_found');const p=(await tx.query<any>('SELECT * FROM business_read_policy WHERE id=$1',[g.policy_id])).rows[0];if(!p)throw Error('not_found');return {grantId:g.id,grantVersion:Number(g.version),policyId:p.id,policyVersion:Number(p.version),policySha256:p.policy_sha,policy:businessReadPolicy(p.policy).policy,approver:{id:g.approved_by,version:Number(g.approver_version),role:'business'}};});
 }
 // Trusted callback only. Graph callers must instead use their existing Sql guard.
 // 仅受信回调；Graph事务内应使用其现有Sql守卫，不调用此入口。
 async withReadGrant<T>(actor:Actor,proof:BusinessReadProof,fn:(tx:Sql)=>Promise<T>){return this.tx(actor,businessReadDelegates(proof.policy,proof.approver),async(tx,locked)=>{await checkBusinessReadInTransaction(tx,actor,proof,locked);return fn(tx);});}
 private async tx<T>(actor:Actor,refs:{id:string;version:number;role:'it'|'business'}[],fn:(tx:Sql,locked:LockedReadPrincipals)=>Promise<T>){
  return this.db.transaction(async tx=>{
   const required=new Map<string,{version:number;role:string}>();for(const ref of [...refs,{id:actor.id,version:actor.authorizationVersion,role:actor.role==='it'?'it':'business'}]){const old=required.get(ref.id);if(old&&(old.version!==ref.version||old.role!==ref.role))throw Error('business_read_identity_conflict');required.set(ref.id,ref);}
   const locked=new Map<string,{version:number;role:string;disabled:boolean}>();
   for(const [id,ref]of [...required].sort(([a],[b])=>a.localeCompare(b))){const p=(await tx.query<any>('SELECT role,disabled,authorization_version FROM principal WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[actor.enterpriseId,id])).rows[0];if(!p||p.disabled||Number(p.authorization_version)!==ref.version||!(ref.role==='it'?p.role==='it':['executive','operations'].includes(p.role))||id===actor.id&&p.role!==actor.role)throw Error('not_authorized');locked.set(id,{version:Number(p.authorization_version),role:p.role,disabled:p.disabled});}
   await requireEnterpriseLock(tx,actor.enterpriseId);await tx.exec('SET LOCAL ROLE eb_app');await tx.query("SELECT set_config('app.enterprise_id',$1,true)",[actor.enterpriseId]);return fn(tx,locked);
  });
 }
 async reviewPolicy(actor:Actor,input:unknown){return this.persistPolicy(actor,input);}
 private async persistPolicy(actor:Actor,input:unknown,validatedEndpoint?:string){
  if(actor.role!=='it')throw Error('not_authorized');const q=z.object({policy:z.unknown(),endpointAndFieldsAcknowledged:z.literal(true)}).strict().parse(input),f=businessReadPolicy(q.policy);
  if(f.policy.policyReviewer.id!==actor.id||f.policy.policyReviewer.version!==actor.authorizationVersion)throw Error('not_authorized');
  return this.tx(actor,businessReadDelegates(f.policy),async(tx,locked)=>{
   await checkBusinessReadSourceInTransaction(tx,actor,f.policy,locked);if(Number((await tx.query<any>('SELECT count(*) n FROM business_read_policy')).rows[0].n)>=500)throw Error('business_read_policy_capacity');const id=randomUUID();
   await tx.query('INSERT INTO business_read_policy(enterprise_id,id,version,binding_id,reviewed_by,reviewer_version,policy,policy_sha) VALUES($1,$2,1,$3,$4,$5,$6,$7)',[actor.enterpriseId,id,f.policy.bindingId,actor.id,actor.authorizationVersion,JSON.stringify(f.policy),f.sha256]);
   if(validatedEndpoint)await tx.query('INSERT INTO business_policy_validation(enterprise_id,policy_id,policy_version,policy_sha,metadata_sha,metadata_endpoint) VALUES($1,$2,1,$3,$4,$5)',[actor.enterpriseId,id,f.sha256,f.policy.metadataSha256,validatedEndpoint]);
   await this.audit(tx,actor,'business_read_policy_reviewed',{policyId:id,sha256:f.sha256});return {id,version:1,sha256:f.sha256,businessAuthorized:false};
  });
 }
 async approve(actor:Actor,id:string,input:unknown){
  if(!['executive','operations'].includes(actor.role))throw Error('not_authorized');uuid.parse(id);
  const q=z.object({expectedVersion:version,policySha256:z.string().regex(/^[a-f0-9]{64}$/),ttlSeconds:z.number().int().min(30).max(600).default(300),businessReadAcknowledged:z.literal(true)}).strict().parse(input);
  const initial=await withEnterprise(this.db,actor.enterpriseId,async tx=>(await tx.query<any>('SELECT policy FROM business_read_policy WHERE id=$1',[id])).rows[0]);if(!initial)throw Error('not_found');const f=businessReadPolicy(initial.policy);
  return this.tx(actor,businessReadDelegates(f.policy),async(tx,locked)=>{
   await checkBusinessReadSourceInTransaction(tx,actor,f.policy,locked);
   const p=(await tx.query<any>('SELECT * FROM business_read_policy WHERE id=$1 FOR SHARE',[id])).rows[0];if(!p||p.revoked||Number(p.version)!==q.expectedVersion||p.policy_sha!==q.policySha256||p.policy_sha!==f.sha256)throw Error('business_read_policy_changed');
   const validated=(await tx.query<any>('SELECT * FROM business_policy_validation WHERE policy_id=$1',[id])).rows[0];if(!validated||Number(validated.policy_version)!==Number(p.version)||validated.policy_sha!==f.sha256||validated.metadata_sha!==f.policy.metadataSha256)throw Error('business_read_policy_not_validated');
   if(Number((await tx.query<any>('SELECT count(*) n FROM business_read_grant')).rows[0].n)>=1000)throw Error('business_read_grant_capacity');const grant=randomUUID();const saved=(await tx.query<any>(`INSERT INTO business_read_grant(enterprise_id,id,version,policy_id,policy_version,policy_sha,approved_by,approver_version,purpose,created_at,expires_at)
    SELECT $1,$2,1,$3,$4,$5,$6,$7,$8,clock_timestamp(),LEAST(expires_at,clock_timestamp()+$9*interval '1 second') FROM onboarding_scope WHERE id=$10 AND expires_at>clock_timestamp()+interval '1 second' RETURNING expires_at`,[actor.enterpriseId,grant,id,p.version,f.sha256,actor.id,actor.authorizationVersion,f.policy.purpose,q.ttlSeconds,f.policy.scopeId])).rows[0];if(!saved)throw Error('business_read_expired');
   await this.audit(tx,actor,'business_read_approved',{grantId:grant,policyId:id,sha256:f.sha256});return {id:grant,version:1,expiresAt:new Date(saved.expires_at).toISOString()};
  });
 }
 async revoke(actor:Actor,id:string,expectedVersion:number){
  uuid.parse(id);version.parse(expectedVersion);if(!['executive','operations'].includes(actor.role))throw Error('not_authorized');
  return this.tx(actor,[],async tx=>{const g=(await tx.query<any>('SELECT * FROM business_read_grant WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!g)throw Error('not_found');if(g.approved_by!==actor.id&&actor.role!=='executive')throw Error('not_authorized');if(Number(g.version)!==expectedVersion)throw Error('business_read_grant_changed');if(!g.revoked)await tx.query('UPDATE business_read_grant SET revoked=true,version=version+1 WHERE id=$1',[id]);await this.audit(tx,actor,'business_read_revoked',{grantId:id});return {id,revoked:true,version:g.revoked?expectedVersion:expectedVersion+1};});
 }
 private async audit(tx:Sql,actor:Actor,kind:string,details:unknown){await tx.query('INSERT INTO audit_event(enterprise_id,id,kind,details) VALUES($1,$2,$3,$4)',[actor.enterpriseId,randomUUID(),kind,JSON.stringify(details)]);}
}
