// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// One GET per durable reference; uncertain attempts are never automatically replayed.
// 每持久引用仅一次GET，不确定尝试不自动重放。
import {z} from 'zod';import type {Actor} from '../identity/service.ts';import {hash} from '../runtime/contracts.ts';
import {BusinessReadGrants} from './business-read-grants.ts';import {readBoundedBusinessRows} from './business-read-http.ts';
import type {BusinessReadProof} from './business-read-guard.ts';
export class BusinessReadService{
 private grants:BusinessReadGrants;constructor(grants:BusinessReadGrants){this.grants=grants;}
 private receipt(actor:Actor,proof:BusinessReadProof,row:any){
  if(row.grant_id!==proof.grantId||Number(row.grant_version)!==proof.grantVersion||row.policy_sha!==proof.policySha256||row.requested_by!==actor.id||Number(row.requester_version)!==actor.authorizationVersion)throw Error('business_read_reference_conflict');
  if(row.state==='completed'&&hash(row.projection)!==row.projection_sha)throw Error('business_read_receipt_corrupt');
  return {reference:row.reference,state:row.state==='completed'?'completed':'unknown',receiptRef:'business-read-'+row.reference,sourceRevision:row.policy_sha,data:row.state==='completed'?{rows:row.projection}:{}};
 }
 async lookup(actor:Actor,proof:BusinessReadProof,reference:string){z.uuid().parse(reference);return this.grants.withReadGrant(actor,proof,async tx=>{const row=(await tx.query<any>('SELECT * FROM business_read_receipt WHERE reference=$1',[reference])).rows[0];return row?this.receipt(actor,proof,row):{reference,state:'unknown',data:{}};});}
 async submit(actor:Actor,proof:BusinessReadProof,reference:string,signal?:AbortSignal){
  z.uuid().parse(reference);const existing=await this.grants.withReadGrant(actor,proof,async tx=>{
   const old=(await tx.query<any>('SELECT * FROM business_read_receipt WHERE reference=$1 FOR UPDATE',[reference])).rows[0];if(old)return this.receipt(actor,proof,old);
   await tx.query("INSERT INTO business_read_receipt(enterprise_id,reference,grant_id,grant_version,policy_sha,requested_by,requester_version,state,deadline) VALUES($1,$2,$3,$4,$5,$6,$7,'issued',clock_timestamp()+$8*interval '1 millisecond')",[actor.enterpriseId,reference,proof.grantId,proof.grantVersion,proof.policySha256,actor.id,actor.authorizationVersion,proof.policy.timeoutMs]);return null;
  });if(existing)return existing;
  const response=await readBoundedBusinessRows(proof.policy,{check:async()=>{await this.grants.withReadGrant(actor,proof,async tx=>{const row=(await tx.query<any>("SELECT state,deadline>clock_timestamp() live FROM business_read_receipt WHERE reference=$1 FOR SHARE",[reference])).rows[0];if(!row||row.state!=='issued'||!row.live)throw Error('business_read_attempt_expired');});}},signal);
  return this.grants.withReadGrant(actor,proof,async tx=>{
   const row=(await tx.query<any>('SELECT * FROM business_read_receipt WHERE reference=$1 FOR UPDATE',[reference])).rows[0];if(row.state!=='issued')return this.receipt(actor,proof,row);
   if(response.status==='read'){
    const saved=(await tx.query<any>("UPDATE business_read_receipt SET state='completed',projection=$2,projection_sha=$3,completed_at=clock_timestamp() WHERE reference=$1 AND deadline>clock_timestamp() RETURNING *",[reference,JSON.stringify(response.rows),response.projectionSha256])).rows[0];
    if(saved){await tx.query('INSERT INTO audit_event(enterprise_id,id,kind,details) VALUES($1,gen_random_uuid(),$2,$3)',[actor.enterpriseId,'business_read_completed',JSON.stringify({reference,policySha256:proof.policySha256})]);return this.receipt(actor,proof,saved);}
   }
   const unknown=(await tx.query<any>("UPDATE business_read_receipt SET state='unknown' WHERE reference=$1 RETURNING *",[reference])).rows[0];return this.receipt(actor,proof,unknown);
  });
 }
}
