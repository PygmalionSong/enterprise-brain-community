// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Fixed anonymous owned-case DTO. This is not a generic customer-data exposure policy.
// 固定匿名自有案例DTO，不作为真实客户数据的通用开放策略。
import {z} from 'zod';
import {withEnterprise,type Database} from '../db/adapter.ts';
import type {Actor} from '../identity/service.ts';
import type {ConnectionService} from '../connectors/discovery.ts';
import {DEMO_ENTERPRISE} from '../industry/seed.ts';
const rowSchema=z.object({customer_code:z.enum(['KA-001','MEM-001','MEM-002']),party_type:z.enum(['B2B','B2C']),segment:z.enum(['key_account','repeat_member','new_member']),marketing_consent:z.boolean(),order_code:z.string().regex(/^ORDER-[A-Z0-9-]{1,40}$/).nullable(),channel:z.enum(['modern','ecommerce']).nullable(),quantity_cases:z.string().regex(/^\d{1,14}$/).nullable(),net_amount_cny:z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).nullable(),order_state:z.enum(['confirmed','cancelled']).nullable()}).strict();
export type CustomerCaseInsight={code:'consent_unavailable'|'cancelled_order_review'|'delivery_evidence_needed';basis:string[];owner:'customer_owner'|'sales_owner'};
export type CustomerCase={caseId:string;asOf:string;updatedAt:string;customers:{id:string;kind:'B2B'|'B2C';segment:string;marketingConsent:boolean;orders:{id:string;channel:'modern'|'ecommerce';state:'confirmed'|'cancelled';quantityCases:string;netAmountCny:string}[];insights:CustomerCaseInsight[]}[]};
export class CustomerCaseService {
 private db:Database;private connections:ConnectionService;
 constructor(db:Database,connections:ConnectionService){this.db=db;this.connections=connections;}
 async read(actor:Actor):Promise<CustomerCase>{
  if(actor.enterpriseId!==DEMO_ENTERPRISE||actor.role!=='executive')throw Error('business_access_denied');const id='CON-09',c=(await withEnterprise(this.db,actor.enterpriseId,tx=>tx.query('SELECT version FROM connector_connection WHERE id=$1',[id]))).rows[0];if(!c)throw Error('customer_case_unavailable');await this.connections.assertActive(actor.enterpriseId,id,'read');
  return this.connections.commitExecutiveRead(actor,id,Number(c.version),async(tx,connection)=>{
   if(connection.driver_version!=='owned-sql-crm-fixture-3'||connection.mapping.version!=='crm-customer-consent-order-v1'||connection.report?.schema?.view!=='crm_fixture_read'||!connection.confirmation.processAcknowledged)throw Error('customer_case_unavailable');
   const state=(await tx.query('SELECT binding,as_of,updated_at FROM connector_sync_state WHERE connection_id=$1',[id])).rows[0];if(!state||state.binding!==connection.confirmation.binding)throw Error('customer_case_unavailable');
   const raw=(await tx.query('SELECT payload FROM connector_projection WHERE connection_id=$1 ORDER BY group_key,record_key LIMIT 129',[id])).rows;if(raw.length>128)throw Error('customer_case_unavailable');const customers:CustomerCase['customers']=[],orderIds=new Set<string>();
   for(const {payload}of raw){const p=payload as Record<string,unknown>;const r=rowSchema.parse(Object.fromEntries(Object.keys(rowSchema.shape).map(key=>[key,p[key]])));let customer=customers.find(c=>c.id===r.customer_code);if(!customer){customer={id:r.customer_code,kind:r.party_type,segment:r.segment,marketingConsent:r.marketing_consent,orders:[],insights:[]};customers.push(customer);}else if(customer.kind!==r.party_type||customer.segment!==r.segment||customer.marketingConsent!==r.marketing_consent)throw Error('customer_case_unavailable');
    if(r.order_code!==null){if(r.channel===null||r.order_state===null||r.quantity_cases===null||r.net_amount_cny===null||orderIds.has(r.order_code))throw Error('customer_case_unavailable');orderIds.add(r.order_code);customer.orders.push({id:r.order_code,channel:r.channel,state:r.order_state,quantityCases:r.quantity_cases,netAmountCny:r.net_amount_cny});}else if([r.channel,r.order_state,r.quantity_cases,r.net_amount_cny].some(v=>v!==null))throw Error('customer_case_unavailable');
   }
   for(const customer of customers){if(customer.kind==='B2C'&&!customer.marketingConsent)customer.insights.push({code:'consent_unavailable',basis:[customer.id],owner:'customer_owner'});const cancelled=customer.orders.filter(o=>o.state==='cancelled').map(o=>o.id),confirmed=customer.orders.filter(o=>o.state==='confirmed').map(o=>o.id);if(cancelled.length)customer.insights.push({code:'cancelled_order_review',basis:cancelled,owner:'sales_owner'});if(confirmed.length)customer.insights.push({code:'delivery_evidence_needed',basis:confirmed,owner:'sales_owner'});}
   return {caseId:'CUSTOMER-20261012',asOf:new Date(String(state.as_of)).toISOString(),updatedAt:new Date(String(state.updated_at)).toISOString(),customers};
  });
 }
}
