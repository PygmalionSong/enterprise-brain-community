// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Fixed restored read-authority fencing. Caller owns the transaction and audit.
// 固定读取授权冻结，事务与审计由调用者负责。
import type {Sql} from '../db/adapter.ts';
import {inspectSchemaHealth,type SchemaInventory} from '../db/schema-health.ts';
export async function freezeRestoredReadAuthority(tx:Sql,enterpriseId:string,expected:SchemaInventory){
 if(expected.length!==33||expected.at(-1)?.id!=='033_business_policy_validation.sql'||(await inspectSchemaHealth(tx,expected)).state!=='current')throw Error('restored_authority_schema_mismatch');
 if((await tx.query('SELECT id FROM enterprise WHERE id=$1',[enterpriseId])).rows.length!==1)throw Error('restored_authority_enterprise_missing');
 const result:Record<string,number>={};const change=async(name:string,sql:string)=>{result[name]=(await tx.query(sql,[enterpriseId])).rows.length;};
 await change('scopes','UPDATE onboarding_scope SET revoked=true,version=version+1 WHERE enterprise_id=$1 AND NOT revoked RETURNING id');
 await change('runs',"UPDATE onboarding_run r SET state=CASE WHEN EXISTS(SELECT 1 FROM onboarding_run_target t WHERE t.enterprise_id=r.enterprise_id AND t.run_id=r.id AND t.state='issued') THEN 'unknown' ELSE 'cancelled' END,version=version+1 WHERE enterprise_id=$1 AND state IN ('authorized','running') RETURNING id");
 await change('targets',"UPDATE onboarding_run_target SET state=CASE WHEN state='issued' THEN 'unknown' ELSE 'cancelled' END WHERE enterprise_id=$1 AND state IN ('issued','pending') RETURNING run_id");
 await change('reviews','UPDATE onboarding_review SET revoked=true,version=version+1 WHERE enterprise_id=$1 AND NOT revoked RETURNING id');
 await change('bindings',"UPDATE onboarding_binding SET state='revoked',version=version+1 WHERE enterprise_id=$1 AND state<>'revoked' RETURNING id");
 await change('readTests',"UPDATE onboarding_read_test SET state='unavailable',completed_at=clock_timestamp(),code='restored_confirmation_required' WHERE enterprise_id=$1 AND state='issued' RETURNING id");
 await change('policies','UPDATE business_read_policy SET revoked=true,version=version+1 WHERE enterprise_id=$1 AND NOT revoked RETURNING id');
 await change('grants','UPDATE business_read_grant SET revoked=true,version=version+1 WHERE enterprise_id=$1 AND NOT revoked RETURNING id');
 await change('receipts',"UPDATE business_read_receipt SET state='unknown' WHERE enterprise_id=$1 AND state='issued' RETURNING reference");

 return result;
}
