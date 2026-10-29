// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Closed model envelope; argument JSON remains untrusted until installed-tool validation.
// 封闭模型信封；参数JSON须经已安装工具核对，不能直接执行。
import {z} from 'zod';
import {planningDataSchema} from './planning-ledger.ts';
import {planningCandidateSchema} from './planning-context.ts';
const lines=z.array(z.string().min(1).max(1000)).max(12),id=z.string().min(1).max(80);
export const planningModelWireSchema=z.object({format:z.literal('enterprise-brain.planning-response/1'),kind:z.enum(['need_input','candidate']),questions:lines,rationale:lines,assumptions:lines,routes:z.array(z.object({processId:id,nodeId:id,edgeId:id}).strict()).max(128),bindings:z.array(z.object({processId:id,nodeId:id,toolId:id,toolVersion:id,argumentsJson:z.string().min(2).max(16384)}).strict()).max(256)}).strict();
// The wire root is one closed object, not a provider-specific top-level union.
// 线上格式根为单一封闭对象，不使用供应商不支持的根联合类型。
export function planningModelOutputSchema(){return z.toJSONSchema(planningModelWireSchema);}
export function decodePlanningModelOutput(input:unknown){planningDataSchema.parse(input);const q=planningModelWireSchema.parse(input);if(q.kind==='need_input'){if(q.bindings.length||q.routes.length||q.rationale.length)throw Error('planning_wire_branch_invalid');return planningCandidateSchema.parse({kind:q.kind,questions:q.questions,assumptions:q.assumptions});}if(q.questions.length)throw Error('planning_wire_branch_invalid');const bindings=q.bindings.map(b=>{let args:unknown;try{args=JSON.parse(b.argumentsJson);}catch{throw Error('planning_wire_arguments_invalid');}return {processId:b.processId,nodeId:b.nodeId,toolId:b.toolId,toolVersion:b.toolVersion,args};});return planningCandidateSchema.parse({kind:q.kind,routes:q.routes,bindings,rationale:q.rationale,assumptions:q.assumptions});}
