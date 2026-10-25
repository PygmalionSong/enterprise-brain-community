// Strict, typed projection input; arbitrary JSON never becomes a numeric fact. / 严格投影输入，不将任意JSON当数值事实。
import { z } from 'zod';
const text=z.string().min(1), day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/), instant=z.string().datetime({offset:true});
const decimal=z.string().regex(/^-?\d+(\.\d{1,6})?$/), count=z.number().int().nonnegative(), flag=z.boolean();
export const projectionSchemas = {
  product_revision:z.object({sku_id:text,pack_version:count,bom_version:text,effective_from:day,effective_to:day.nullable(),approval_state:z.enum(['draft','review','approved']),replacement_sku:text.nullable()}).strict(),
  demand_supply_bucket:z.object({sku_id:text,location_id:text,week_start:day,forecast_version:text,demand_cases:count,supply_cases:count,consumed_order_cases:count,supply_type:text,available_on:day,commitment_state:text}).strict(),
  trade_line:z.object({document_code:text,line_no:count,customer_code:text,store_code:text.nullable(),primary_channel:text,outlet_format:text,ka_tier:text,touchpoint:text,sell_kind:z.enum(['sell_in','sell_out']),quantity:decimal,unit_code:text,net_amount:decimal,tax_amount:decimal,currency:text,recognition_date:day}).strict(),
  stock_position_movement:z.object({sku_id:text,pack_version:count,lot_code:text,owner_code:text,site_code:text,quality_state:z.enum(['released','inspection','held']),opening_qty:decimal,receipts_qty:decimal,issues_qty:decimal,adjustment_qty:decimal,closing_qty:decimal,unit_code:text,conversion_version:text,cutoff:day}).strict(),
  resource_commitment:z.object({resource_code:text,bucket_start:instant,bucket_end:instant,unit_code:text,capacity:decimal,reserved:decimal,plan_code:text,source_reservation_ref:text.nullable(),state:z.enum(['planned','reserved','unknown','released']),version:count}).strict(),
  supplier_delivery:z.object({supplier_code:text,qualification_version:text,qualification_until:day,material_code:text,po_code:text,promised_on:day,arrived_on:day.nullable(),expected_qty:decimal,actual_qty:decimal.nullable(),unit_code:text,inspection_ref:text.nullable(),capa_ref:text.nullable()}).strict(),
  production_order:z.object({order_code:text,line_code:text,copacker_code:text.nullable(),sku_id:text,process_version:text,bom_version:text,shift_date:day,scheduled_hours:decimal,maintenance_hours:decimal,cleaning_hours:decimal,input_cases:count,good_output_cases:count,fact_state:z.enum(['planned','actual'])}).strict(),
  logistics_line:z.object({transfer_code:text,from_site:text,to_site:text,owner_code:text,legal_entity_code:text,sku_id:text,lot_code:text,shipped_cases:count,received_cases:count,stage:z.enum(['request','shipped','received']),required_arrival:instant,source_document_code:text}).strict(),
  finance_entry_projection:z.object({document_code:text,legal_entity_code:text,account_code:text,customer_code:text.nullable(),currency:text,fx_version:text,amount:decimal,entry_kind:text,recognized_on:day,due_on:day.nullable(),allocated_on:day.nullable(),intercompany:flag}).strict(),
  customer_lifecycle_snapshot:z.object({party_code:text,party_type:z.enum(['B2B','B2C']),parent_code:text.nullable(),snapshot_on:day,cohort_code:text,segment_rule:text,cohort_size:count,repeat_count:count,marketing_consent:flag,unresolved_service_code:text.nullable()}).strict(),
  store_asset_observation:z.object({store_code:text,asset_code:text,shelf_code:text,floorplan_version:text,sku_id:text,window_start:instant,window_end:instant,traffic_count:count,dwell_seconds:count,observed_minutes:count,stockout_minutes:count,device_online:flag,temperature_c:decimal.nullable(),experiment_group:text}).strict(),
  responsibility_capacity:z.object({org_code:text,role_code:text,assignment_code:text,work_date:day,scheduled_hours:decimal,available_hours:decimal,aggregate_cost:decimal,currency:text,field_policy:text}).strict()
};
export type ProjectionKind=keyof typeof projectionSchemas;
export function validateProjection(kind:ProjectionKind, input:unknown):Record<string,unknown> {return projectionSchemas[kind].parse(input);}
export function projectionKind(s:string):ProjectionKind {if(!(s in projectionSchemas))throw new Error('unsupported_projection');return s as ProjectionKind;}
