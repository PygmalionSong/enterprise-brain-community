// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Shared fixed authority fencing; caller owns the SQL transaction,audit and CONNECT grant.
// 共用固定授权冻结；SQL事务、审计与CONNECT授权由调用方负责。
import type {Database} from '../db/adapter.ts';
import type {SchemaInventory} from '../db/schema-health.ts';
import {freezeRestoredReadAuthority} from './restored-read-authority.ts';
import {suspendRestoredGraphSupervision} from '../runtime/graph-supervision.ts';
import {suspendRestoredPlanning} from '../runtime/planning-ledger.ts';
import {suspendRestoredObservations} from '../runtime/business-observations.ts';
import {suspendRestoredAnalysisPolicy} from '../runtime/analysis-policy.ts';
import {suspendRestoredBusinessAnalysis} from '../runtime/business-analysis-ledger.ts';
import {suspendRestoredBusinessHistory} from '../runtime/business-history.ts';
export async function fenceNativeEnterpriseAuthority(db:Database,enterprise:string,expected:SchemaInventory){
 const restoredReadAuthority=await freezeRestoredReadAuthority(db,enterprise,expected);
 const supervision=await suspendRestoredGraphSupervision(db,enterprise),planning=await suspendRestoredPlanning(db,enterprise),observations=await suspendRestoredObservations(db,enterprise),analysisPolicies=await suspendRestoredAnalysisPolicy(db,enterprise),analysisRequests=await suspendRestoredBusinessAnalysis(db,enterprise),historyPolicies=await suspendRestoredBusinessHistory(db,enterprise),now=new Date();
   const sessions=(await db.query('UPDATE auth_session SET revoked_at=$2 WHERE revoked_at IS NULL AND principal_id IN (SELECT id FROM principal WHERE enterprise_id=$1) RETURNING token_hash',[enterprise,now])).rows.length;
   const bootstrap=(await db.query('UPDATE bootstrap_grant SET consumed_at=$2 WHERE enterprise_id=$1 AND consumed_at IS NULL RETURNING token_hash',[enterprise,now])).rows.length;
   const approvals=(await db.query('UPDATE process_graph_approval SET revoked=true WHERE enterprise_id=$1 AND NOT revoked RETURNING id',[enterprise])).rows.length;
   const schedules=(await db.query("UPDATE connector_sync_schedule SET enabled=false,state='suspended',version=version+1,lease_id=NULL,lease_until=NULL,code='restored_confirmation_required' WHERE enterprise_id=$1 AND (enabled OR lease_id IS NOT NULL) RETURNING connection_id",[enterprise])).rows.length;
   const channels=(await db.query('UPDATE event_channel SET enabled=false,version=version+1 WHERE enterprise_id=$1 AND enabled RETURNING id',[enterprise])).rows.length;
   const grants=(await db.query('UPDATE discovery_grant SET revoked=true WHERE enterprise_id=$1 AND NOT revoked RETURNING id',[enterprise])).rows.length;
   const connections=(await db.query("UPDATE connector_connection SET read_enabled=false,write_enabled=false,state='needs_authorization',version=version+1 WHERE enterprise_id=$1 AND (read_enabled OR write_enabled) RETURNING id",[enterprise])).rows.length;
   const counts={restoredReadAuthority,supervision,planning,observations,analysisPolicies,analysisRequests,historyPolicies,sessions,bootstrap,approvals,schedules,channels,grants,connections};
 return counts;
}
