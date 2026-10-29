// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Constructed data is versioned and idempotently loaded. / 构造数据版本化且幂等加载。
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Database, Sql } from '../db/adapter.ts';
import { validateProjection, type ProjectionKind } from './projections.ts';
export const DEMO_ENTERPRISE='11111111-1111-4111-8111-111111111111';
export const DEMO_EXECUTIVE='22222222-2222-4222-8222-222222222222';
export const uuid=(key:string)=>{const h=createHash('sha256').update(key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
export interface Stage {domainId:string;stageId:string;ordinal:number;title:Record<string,string>;domainTitle:Record<string,string>;ownerTitle:Record<string,string>;projectionKind:ProjectionKind;metricIds:string[];ruleIds:string[];readTool:string;actionCapability:string}
export async function readCase(root:string){return {stages:JSON.parse(await readFile(`${root}/data/stages.json`,'utf8')) as Stage[], scenario:JSON.parse(await readFile(`${root}/data/supply-scenario.json`,'utf8'))};}
async function insert(tx:Sql,table:string,fields:Record<string,unknown>){const keys=Object.keys(fields);await tx.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(fields));}
export async function seed(db:Database,root:string) {
 const {stages,scenario}=await readCase(root),fingerprint=createHash('sha256').update(JSON.stringify({stages,scenario})).digest('hex');
 return db.transaction(async tx=>{
  const prior=await tx.query("SELECT checksum FROM seed_manifest WHERE id='beverage-v1'");
  if(prior.rows.length){if(prior.rows[0].checksum!==fingerprint)throw new Error('fixture_changed_requires_new_version');return {seeded:false};}
  await insert(tx,'enterprise',{id:DEMO_ENTERPRISE,name:'某饮料集团',environment:'demo',currency:'CNY',timezone:'Asia/Shanghai'});
  await insert(tx,'principal',{id:DEMO_EXECUTIVE,enterprise_id:DEMO_ENTERPRISE,username:'demo-executive',role:'executive'});
  const scopes=[['GROUP',null,['HC-A','HC-B','OTHER-SOUTH','OTHER-CHINA','INTERNATIONAL']],['SOUTH','GROUP',['HC-A','HC-B','OTHER-SOUTH']],['HC','SOUTH',['HC-A','HC-B']],['REST-SOUTH','SOUTH',['OTHER-SOUTH']]];
  for(const [id,parent,members] of scopes){await insert(tx,'business_scope',{enterprise_id:DEMO_ENTERPRISE,id,version:1,parent_id:parent,name:JSON.stringify({zh:id==='GROUP'?'集团':id==='SOUTH'?'华南':id==='HC'?'重点客户组合':'华南其他客户',en:id,ja:id==='GROUP'?'グループ':id==='SOUTH'?'華南':id==='HC'?'重点顧客群':'華南の他顧客'})});for(const member of members as string[])await insert(tx,'scope_member',{enterprise_id:DEMO_ENTERPRISE,scope_id:id,scope_version:1,member_id:member});}
  for(const s of scenario.skus)await insert(tx,'sku_pack',{enterprise_id:DEMO_ENTERPRISE,sku_id:s.id,pack_version:1,volume_ml:s.volumeMl,units_per_case:s.unitsPerCase,packaging_type:s.pack});
  const sourceId=uuid('case-source-summary');
  await insert(tx,'source_record',{enterprise_id:DEMO_ENTERPRISE,id:sourceId,source_id:'CASE',external_id:'CASE-SUMMARY',source_version:'v1',business_time:'2026-10-12T08:00:00+08:00',recorded_at:'2026-10-13T08:00:00+08:00',fact_kind:'constructed_actual',payload_hash:fingerprint,payload:JSON.stringify({case:'beverage-v1',constructed:true})});
  const metrics:[string,string,string,number,string,string,string][]=[
    ['plan_cash','CNY','plan',52200000,'SOUTH','2026-10-12','2026-10-19'],['incremental_cost','CNY','plan',10400000,'SOUTH','2026-10-12','2026-10-19'],['demand','sales_case','plan',4800000,'SOUTH','2026-10-12','2026-10-19'],['supply','sales_case','plan',3200000,'SOUTH','2026-10-12','2026-10-19'],['gap','sales_case','plan',1600000,'SOUTH','2026-10-12','2026-10-19'],
    ['net_revenue','CNY','flow_sum',48600000,'HC','2026-09-01','2026-10-01'],['margin','CNY','flow_sum',16000000,'HC','2026-09-01','2026-10-01'],['closing_ar','CNY','snapshot',16000000,'HC','2026-09-01','2026-10-01'],['closing_cash','CNY','snapshot',22000000,'HC','2026-09-01','2026-10-01'],['closing_stock','sales_case','snapshot',490000,'HC','2026-09-01','2026-10-01'],
    ['own_increment','sales_case','plan',800000,'SOUTH','2026-10-12','2026-10-19'],['transfer_increment','sales_case','plan',600000,'SOUTH','2026-10-12','2026-10-19'],['quality_hold','sales_case','snapshot',30000,'HC','2026-10-12','2026-10-13'],['available_hours','hour','plan',432,'HC','2026-10-12','2026-10-19'],['group_revenue','CNY','flow_sum',80000000000,'GROUP','2025-01-01','2026-01-01']
  ];
  const additional=['distribution','availability','pack_litres','otif','pending_material','released_material','repeat_rate'];
  for(const id of additional)await insert(tx,'metric_definition',{id,version:1,unit_code:['distribution','availability','otif','repeat_rate'].includes(id)?'ratio':id==='pack_litres'?'litre':'material_unit',aggregation:['distribution','availability','otif','repeat_rate'].includes(id)?'ratio':'snapshot',title:JSON.stringify({zh:id,en:id,ja:id})});
  for(const [id,unit,aggregation,value,scope,start,end] of metrics){await insert(tx,'metric_definition',{id,version:1,unit_code:unit,aggregation,title:JSON.stringify({zh:id,en:id,ja:id})});await insert(tx,'metric_observation',{enterprise_id:DEMO_ENTERPRISE,id:uuid('metric-'+id),metric_id:id,scope_id:scope,scope_version:1,period_start:start,period_end:end,fact_kind:aggregation==='plan'?'scenario_plan':'constructed_actual',fact_version:'v1',scenario_id:aggregation==='plan'?'PLAN-SOUTH-v1':'BASELINE',grain_hash:'fixed-cohort-v1',value:String(value),currency:unit==='CNY'?'CNY':null,source_record_id:sourceId});}
  await insert(tx,'case_file',{enterprise_id:DEMO_ENTERPRISE,id:'SUPPLY-20261012',scope_id:'SOUTH',scope_version:1,title:JSON.stringify({zh:'旺季供给与资金协同',en:'Seasonal supply and cash coordination',ja:'季節需要・供給・資金協調'}),period_start:'2026-10-12',period_end:'2026-10-19',scenario_id:'PLAN-SOUTH-v1',state:'analysis'});
  const all:Partial<Record<ProjectionKind,string[]>>={}; const materialIds:string[]=[],qualityIds:string[]=[];
  for(const [i,sku] of (scenario.skus as any[]).entries()){
   const historicOpen=[205000,97500,65000,32500],historicIn=[450000,225000,150000,75000],historicOut=[405000,202500,135000,67500];
   const records:Record<ProjectionKind,Record<string,unknown>>={
    product_revision:{sku_id:sku.id,pack_version:1,bom_version:'BOM-'+sku.id+'-02',effective_from:'2026-11-01',effective_to:null,approval_state:['draft','review','review','approved'][i],replacement_sku:null},
    demand_supply_bucket:{sku_id:sku.id,location_id:'DC-GUANGZHOU',week_start:'2026-10-12',forecast_version:'PLAN-SOUTH-v1',demand_cases:sku.hc.demand*10000,supply_cases:sku.hc.supply*10000,consumed_order_cases:[240000,150000,120000,90000][i],supply_type:'baseline',available_on:'2026-10-12',commitment_state:'review'},
    trade_line:{document_code:'SO-SEP-'+(i+1),line_no:1,customer_code:i%2?'HC-B':'HC-A',store_code:null,primary_channel:['convenience','retail','foodservice','ecommerce'][i],outlet_format:['chain_store','supermarket','restaurant','online'][i],ka_tier:'key_account',touchpoint:i===3?'online':'field_sales',sell_kind:'sell_in',quantity:String(historicOut[i]),unit_code:'sales_case',net_amount:String([20000000,12000000,10000000,6600000][i]),tax_amount:'0',currency:'CNY',recognition_date:'2026-09-30'},
    stock_position_movement:{sku_id:sku.id,pack_version:1,lot_code:'FG-SEP-'+i,owner_code:'BEV-CN',site_code:'DC-GUANGZHOU',quality_state:'released',opening_qty:String(historicOpen[i]),receipts_qty:String(historicIn[i]),issues_qty:String(historicOut[i]),adjustment_qty:'0',closing_qty:String(historicOpen[i]+historicIn[i]-historicOut[i]),unit_code:'sales_case',conversion_version:'PACK-1',cutoff:'2026-09-30'},
    resource_commitment:{resource_code:'LINE-L'+(i+1),bucket_start:'2026-10-12T08:00:00+08:00',bucket_end:'2026-10-19T08:00:00+08:00',unit_code:'hour',capacity:'120',reserved:String([108,102,110,112][i]),plan_code:'PLAN-SOUTH-v1',source_reservation_ref:null,state:'planned',version:1},
    supplier_delivery:{supplier_code:'PK-'+(18+i),qualification_version:'QUAL-2',qualification_until:'2026-10-31',material_code:'PACK-'+sku.id,po_code:'PO-1012-'+(8+i),promised_on:'2026-10-14',arrived_on:i===1?'2026-10-13':null,expected_qty:String([60000,40000,30000,20000][i]),actual_qty:i===1?'40000':null,unit_code:'piece',inspection_ref:i===1?'QC-PACK-11':null,capa_ref:i===0?'CAPA-PK018':null},
    production_order:{order_code:'MO-1012-'+i,line_code:'L'+(i+1),copacker_code:null,sku_id:sku.id,process_version:'PROC-2',bom_version:'BOM-'+sku.id+'-02',shift_date:'2026-10-14',scheduled_hours:'120',maintenance_hours:'6',cleaning_hours:'6',input_cases:sku.allocation.own*10000,good_output_cases:sku.allocation.own*10000,fact_state:'planned'},
    logistics_line:{transfer_code:'TR-1012-'+i,from_site:'DC-WUHAN',to_site:'DC-GUANGZHOU',owner_code:'BEV-CN',legal_entity_code:'BEV-CN',sku_id:sku.id,lot_code:'FG-1011-'+i,shipped_cases:sku.allocation.transfer*10000,received_cases:0,stage:'shipped',required_arrival:'2026-10-15T18:00:00+08:00',source_document_code:'TRANSFER-'+i},
    finance_entry_projection:{document_code:'GL-SEP-'+i,legal_entity_code:'BEV-CN',account_code:['REVENUE','COGS','AR','CASH'][i],customer_code:i<3?'HC-A':null,currency:'CNY',fx_version:'CNY-1',amount:String([48600000,32600000,16000000,22000000][i]),entry_kind:['net_revenue','cogs','ar_balance','cash_balance'][i],recognized_on:'2026-09-30',due_on:i===2?'2026-10-30':null,allocated_on:null,intercompany:false},
    customer_lifecycle_snapshot:{party_code:'COHORT-'+i,party_type:'B2C',parent_code:null,snapshot_on:'2026-10-12',cohort_code:'OBS30-'+i,segment_rule:'LCM-1',cohort_size:[30000,12000,6000,2000][i],repeat_count:[6600,1800,720,120][i],marketing_consent:i!==2,unresolved_service_code:i===2?'CS-1011-08':null},
    store_asset_observation:{store_code:'GZ-018',asset_code:'COOLER-018',shelf_code:'SHELF-'+(i+1),floorplan_version:'GZ018-2',sku_id:sku.id,window_start:'2026-10-12T17:00:00+08:00',window_end:'2026-10-12T19:00:00+08:00',traffic_count:[360,220,160,110][i],dwell_seconds:[2160,980,740,620][i],observed_minutes:120,stockout_minutes:[35,0,15,0][i],device_online:i!==2,temperature_c:['6.0','7.0','16.0','5.0'][i],experiment_group:'baseline'},
    responsibility_capacity:{org_code:'FACTORY-SOUTH',role_code:'SHIFT-'+i,assignment_code:'SUPPLY-20261012-'+i,work_date:'2026-10-14',scheduled_hours:'120',available_hours:'108',aggregate_cost:'48000',currency:'CNY',field_policy:'aggregate_only'}
   };
   for(const [kind,input] of Object.entries(records)){
    const k=kind as ProjectionKind,fields=validateProjection(k,input),id=uuid(kind+'-'+i),source=uuid('source-'+kind+'-'+i),isPlan=['demand_supply_bucket','production_order','resource_commitment','product_revision','logistics_line','responsibility_capacity'].includes(kind),factKind=isPlan?'scenario_plan':'constructed_actual';
    const historical=['stock_position_movement','trade_line','finance_entry_projection'].includes(kind),time=historical?'2026-09-30T23:00:00+08:00':'2026-10-12T08:00:00+08:00';
    await insert(tx,'source_record',{enterprise_id:DEMO_ENTERPRISE,id:source,source_id:'CASE-'+kind,external_id:kind+'-'+i,source_version:'v1',business_time:time,recorded_at:'2026-10-13T08:00:00+08:00',fact_kind:factKind,payload_hash:createHash('sha256').update(JSON.stringify(fields)).digest('hex'),payload:JSON.stringify({recordCode:kind+'-'+i,constructed:true})});
    await insert(tx,'projection_registry',{enterprise_id:DEMO_ENTERPRISE,id,kind,schema_version:1,source_record_id:source,fact_kind:factKind,business_time:time,recorded_at:'2026-10-13T08:00:00+08:00'});
    await insert(tx,kind,{enterprise_id:DEMO_ENTERPRISE,id,...fields});(all[k]??=[]).push(id);
    if(k==='stock_position_movement')for(const [group,target] of [['materials',materialIds],['quality',qualityIds]] as const){
      const extraId=uuid(group+'-'+i),extraSource=uuid('source-'+group+'-'+i);
      const qty=group==='materials'?[120000,12000,6000,680000][i]:[30000,50000,200000,120000][i];
      const material=group==='materials';
      const record=validateProjection('stock_position_movement',{...fields,sku_id:material?['SUGAR','FILM','CONCENTRATE','CARTON'][i]:sku.id,lot_code:group.toUpperCase()+'-1012-'+i,site_code:material?'FACTORY-SOUTH':'DC-GUANGZHOU',quality_state:material?(i===1?'inspection':'released'):['held','inspection','released','released'][i],opening_qty:String(qty),receipts_qty:'0',issues_qty:'0',closing_qty:String(qty),unit_code:material?(i===3?'piece':'kg'):'sales_case',cutoff:'2026-10-12'});
      await insert(tx,'source_record',{enterprise_id:DEMO_ENTERPRISE,id:extraSource,source_id:'CASE-'+group,external_id:group+'-'+i,source_version:'v1',business_time:'2026-10-12T08:00:00+08:00',recorded_at:'2026-10-13T08:00:00+08:00',fact_kind:'constructed_actual',payload_hash:createHash('sha256').update(JSON.stringify(record)).digest('hex'),payload:JSON.stringify({recordCode:group+'-'+i,constructed:true})});
      await insert(tx,'projection_registry',{enterprise_id:DEMO_ENTERPRISE,id:extraId,kind:k,schema_version:1,source_record_id:extraSource,fact_kind:'constructed_actual',business_time:'2026-10-12T08:00:00+08:00',recorded_at:'2026-10-13T08:00:00+08:00'});
      await insert(tx,k,{enterprise_id:DEMO_ENTERPRISE,id:extraId,...record});target.push(extraId);
    }

   }
  }
  for(const stage of stages){await insert(tx,'business_stage',{domain_id:stage.domainId,stage_id:stage.stageId,ordinal:stage.ordinal,title:JSON.stringify(stage.title),domain_title:JSON.stringify(stage.domainTitle),owner_title:JSON.stringify(stage.ownerTitle),metric_ids:stage.metricIds,projection_kind:stage.projectionKind,rule_ids:stage.ruleIds,read_tool:stage.readTool,action_capability:stage.actionCapability});for(const id of (stage.domainId==='materials'?materialIds:stage.domainId==='quality'?qualityIds:all[stage.projectionKind]!))await insert(tx,'stage_projection',{enterprise_id:DEMO_ENTERPRISE,domain_id:stage.domainId,stage_id:stage.stageId,projection_id:id,projection_kind:stage.projectionKind});}
  const objects=[['bottle-1','bottle'],['case-1','case'],['case-2','case'],['pallet-1','pallet'],['pallet-2','pallet']];
  for(const [key,kind] of objects)await insert(tx,'physical_object',{enterprise_id:DEMO_ENTERPRISE,id:uuid(key),kind});
  for(const [code,kind,obj] of [['CAP-IN-001','cap_inner','bottle-1'],['CAP-OUT-001','cap_outer','bottle-1'],['BOX-IN-001','case_inner','case-1'],['BOX-OUT-001','case_outer','case-1'],['PALLET-001','pallet','pallet-1']])await insert(tx,'code_alias',{enterprise_id:DEMO_ENTERPRISE,code,code_kind:kind,object_id:uuid(obj)});
  for(const [child,parent,start,end,event] of [['bottle-1','case-1','2026-10-11T08:00:00+08:00','2026-10-12T08:00:00+08:00','PACK-1'],['bottle-1','case-2','2026-10-12T08:00:00+08:00',null,'REPACK-1'],['case-1','pallet-1','2026-10-11T08:00:00+08:00',null,'PALLETIZE-1'],['case-2','pallet-2','2026-10-12T08:00:00+08:00',null,'PALLETIZE-2']])await insert(tx,'containment',{enterprise_id:DEMO_ENTERPRISE,child_id:uuid(child!),parent_id:uuid(parent!),valid_from:start,valid_to:end,event_id:event});
  await insert(tx,'evidence_hold',{enterprise_id:DEMO_ENTERPRISE,id:uuid('hold-summary'),source_record_id:sourceId,reason:'decision_snapshot',owner_role:'operations',expires_at:null});
  await insert(tx,'audit_event',{enterprise_id:DEMO_ENTERPRISE,id:uuid('seed-audit'),kind:'case_seeded',actor_id:DEMO_EXECUTIVE,details:JSON.stringify({dataset:'beverage-v1',stages:60})});
  await insert(tx,'seed_manifest',{id:'beverage-v1',checksum:fingerprint});return {seeded:true};
 });
}
