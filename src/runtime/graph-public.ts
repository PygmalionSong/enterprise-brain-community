// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Public run status is metadata only;source data uses the explicit current-authority readers.
// 公开运行状态只返回元数据；源数据须通过明确的当前授权读取入口。
import {z} from 'zod';import {graphArgsSchema,graphResultSchema} from './graph-contracts.ts';import {hash} from './contracts.ts';
const id=z.uuid(),code=z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,159}$/),node=z.string().min(1).max(240),integer=z.number().int().nonnegative();
const actionSchema=z.object({id,run_id:id,node_key:node,tool_id:code,tool_version:code,state:z.enum(['dispatching','accepted','unknown','completed','failed','partial']),lookup_count:integer,args:z.unknown(),result:z.unknown(),receipt_ref:z.unknown(),source_revision:z.unknown()}).passthrough();
const eventSchema=z.object({sequence:z.number().int().positive(),kind:code,details:z.unknown(),created_at:z.unknown()}).passthrough();
const runSchema=z.object({id,plan_id:id,approval_id:id,state:z.enum(['ready','running','waiting_external','waiting_input','succeeded','failed','cancelled']),version:z.number().int().positive(),completed_nodes:z.array(node).max(1024),cancel_requested:z.boolean(),reason:z.unknown(),fence:integer,steps:integer,deadline:z.unknown(),lease_until:z.unknown(),created_at:z.unknown(),actions:z.array(actionSchema).max(1024),events:z.array(eventSchema)}).passthrough();
function instant(input:unknown){if(input instanceof Date)return Number.isFinite(input.getTime())?input.toISOString():null;return z.iso.datetime().safeParse(input).success?input as string:null;}
function referenceHash(input:unknown){const p=z.string().min(1).max(160).safeParse(input);return p.success?hash(p.data):null;}
function details(input:unknown){const q=z.object({actionId:id.optional(),nodeKey:node.optional(),state:z.enum(['missing','accepted','completed','failed','partial','unknown']).optional()}).safeParse(input);return q.success?q.data:{};}
export function publicGraphRun(input:unknown){
 const parsed=runSchema.safeParse(input);if(!parsed.success)throw Error('graph_public_view_unavailable');const r=parsed.data,actions=r.actions.map(a=>{const args=graphArgsSchema.safeParse(a.args),result=graphResultSchema.safeParse(a.result);return {id:a.id,run_id:a.run_id,node_key:a.node_key,tool_id:a.tool_id,tool_version:a.tool_version,state:a.state,lookup_count:a.lookup_count,args:null,result:null,receipt_ref:null,source_revision:null,argsHash:args.success?hash(args.data):null,resultHash:result.success?hash(result.data):null,receiptRefHash:referenceHash(a.receipt_ref),sourceRevisionHash:referenceHash(a.source_revision),sourcePayloadRedacted:true};});
 return {format:'enterprise-brain.graph-run-metadata/1',id:r.id,plan_id:r.plan_id,approval_id:r.approval_id,state:r.state,version:r.version,completed_nodes:r.completed_nodes,cancel_requested:r.cancel_requested,reason:code.safeParse(r.reason).success?r.reason:null,fence:r.fence,steps:r.steps,deadline:instant(r.deadline),lease_until:instant(r.lease_until),created_at:instant(r.created_at),actions,events:r.events.slice(-200).map(e=>({sequence:e.sequence,kind:e.kind,details:details(e.details),created_at:instant(e.created_at)})),eventCount:r.events.length,eventsTruncated:r.events.length>200,sourcePayloadRedacted:true};
}
