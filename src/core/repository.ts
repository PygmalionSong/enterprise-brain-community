// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Business reads use the application role and server-derived enterprise. / 业务读取使用应用角色及服务端企业身份。
import { withEnterprise, type Database } from '../db/adapter.ts';
import type { Actor } from '../identity/service.ts';
import { projectionKind } from '../industry/projections.ts';
export function assertBusinessRole(actor:Actor) {if(!['executive','operations','auditor'].includes(actor.role))throw new Error('business_access_denied');}
export async function overview(db:Database,actor:Actor) {
 assertBusinessRole(actor);
 return withEnterprise(db,actor.enterpriseId,async tx=>{
  const metrics=await tx.query('SELECT m.metric_id,m.value::text,m.fact_kind,m.scope_id,m.period_start::text,m.period_end::text,m.currency,d.unit_code,d.aggregation FROM metric_observation m JOIN metric_definition d ON d.id=m.metric_id ORDER BY m.metric_id');
  const stages=await tx.query('SELECT domain_id,stage_id,ordinal,title,domain_title,owner_title,action_capability FROM business_stage ORDER BY domain_id,ordinal');
  const scopes=await tx.query('SELECT id,version,name,parent_id FROM business_scope ORDER BY id');
  const cases=await tx.query('SELECT id,title,state,scope_id,scenario_id,period_start::text,period_end::text FROM case_file');
  const portfolio=await tx.query('SELECT sku_id,demand_cases::text,supply_cases::text FROM demand_supply_bucket ORDER BY sku_id');
  return {metrics:metrics.rows,stages:stages.rows,scopes:scopes.rows,cases:cases.rows,portfolio:portfolio.rows};
 });
}
export async function stageView(db:Database,actor:Actor,domain:string,stage:string) {
 assertBusinessRole(actor);
 return withEnterprise(db,actor.enterpriseId,async tx=>{
  const definition=(await tx.query('SELECT * FROM business_stage WHERE domain_id=$1 AND stage_id=$2',[domain,stage])).rows[0];
  if(!definition)throw new Error('stage_not_found');
  const kind=projectionKind(String(definition.projection_kind)); // allowlist before identifier interpolation / 标识符插值前白名单
  const facts=await tx.query(`SELECT p.*,r.fact_kind,r.business_time::text,r.recorded_at::text FROM stage_projection b JOIN ${kind} p ON p.enterprise_id=b.enterprise_id AND p.id=b.projection_id JOIN projection_registry r ON r.enterprise_id=p.enterprise_id AND r.id=p.id WHERE b.domain_id=$1 AND b.stage_id=$2 ORDER BY p.id`,[domain,stage]);
  return {definition,records:facts.rows.map(({enterprise_id,id,kind,recorded_at,...business})=>business),context:{caseId:'SUPPLY-20261012',scopeId:'HC',historical:['warehouse','finance','channel'].includes(domain),snapshot:'CASE-v1'}};
 });
}
export async function metricsQuery(db:Database,actor:Actor,scope:string,start:string,end:string,factKind:string) {
 assertBusinessRole(actor);
 if(!['GROUP','SOUTH','HC','REST-SOUTH'].includes(scope)||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||!['constructed_actual','budget','forecast','scenario_plan'].includes(factKind))throw new Error('invalid_context');
 return withEnterprise(db,actor.enterpriseId,tx=>tx.query('SELECT metric_id,value::text,numerator::text,denominator::text,scope_id,scope_version,period_start::text,period_end::text,fact_kind,fact_version,scenario_id,currency FROM metric_observation WHERE scope_id=$1 AND period_start=$2 AND period_end=$3 AND fact_kind=$4',[scope,start,end,factKind]));
}
export async function traceAt(db:Database,enterprise:string,code:string,at:string) {
 return withEnterprise(db,enterprise,async tx=>{
  const object=(await tx.query('SELECT object_id FROM code_alias WHERE code=$1',[code])).rows[0];if(!object)return [];
  return (await tx.query(`WITH RECURSIVE path AS (SELECT o.id,o.kind,0 AS depth FROM physical_object o WHERE o.id=$1 UNION ALL SELECT parent.id,parent.kind,p.depth+1 FROM path p JOIN containment c ON c.child_id=p.id AND c.valid_from<=$2 AND (c.valid_to IS NULL OR c.valid_to>$2) JOIN physical_object parent ON parent.id=c.parent_id WHERE p.depth<3) SELECT id,kind,depth,(SELECT min(code) FROM code_alias a WHERE a.object_id=path.id) AS display_code FROM path ORDER BY depth`,[object.object_id,at])).rows;
 });
}
