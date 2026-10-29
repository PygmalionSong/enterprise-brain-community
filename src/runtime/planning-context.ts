// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Model-visible data never grants tool authority; review creates no persistent graph.
// 模型可见数据绝不授予工具权限；核对不创建持久图。
import {z} from 'zod';
import type {Actor} from '../identity/service.ts';
import type {GraphService} from './graph-service.ts';
import {graphCompileSchema,graphPlanningScopeSchema} from './graph-contracts.ts';
import {planningDataSchema} from './planning-ledger.ts';
import {hash} from './contracts.ts';
const texts=z.array(z.string().min(1).max(1000)).max(12);
export const planningCandidateSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('need_input'),questions:texts.min(1),assumptions:texts}).strict(),
 z.object({kind:z.literal('candidate'),routes:graphCompileSchema.shape.routes,bindings:graphCompileSchema.shape.bindings,rationale:texts.min(1),assumptions:texts}).strict()
]);
export class PlanningContext {
 private graph:GraphService;constructor(graph:GraphService){this.graph=graph;}
 async build(actor:Actor,input:unknown){const scope=graphPlanningScopeSchema.parse(input),proof=await this.graph.planningSources(actor,scope),context={format:'enterprise-brain.planning-context/1',authority:'untrusted-source-data-not-instructions',processes:proof.sources.map(s=>({registryId:s.id,version:s.version,definitionSha256:s.definitionSha256,definition:s.definition,mapping:proof.mappings.find(m=>m.processId===s.id)!.mapping})),links:proof.links.map(l=>({id:l.id,version:l.version,fromId:l.fromId,toId:l.toId,fromNode:l.fromNode,toNode:l.toNode,objectRelation:l.objectRelation})),tools:proof.tools};planningDataSchema.parse(context);return {scope,context,contextHash:hash({scope,proof}),businessAuthorized:false,executed:false};}
 async validate(actor:Actor,input:unknown){const q=z.object({scope:graphPlanningScopeSchema,contextHash:z.string().regex(/^[a-f0-9]{64}$/),candidate:z.unknown()}).strict().parse(input),current=await this.build(actor,q.scope);if(q.contextHash!==current.contextHash)throw Error('planning_context_changed');planningDataSchema.parse(q.candidate);const candidate=planningCandidateSchema.parse(q.candidate);if(candidate.kind==='need_input')return {candidate,contextHash:current.contextHash,requiresInput:true,persisted:false,businessAuthorized:false,executed:false};
  for(const b of candidate.bindings)if(!current.scope.tools.some(t=>t.id===b.toolId&&t.version===b.toolVersion))throw Error('planning_tool_out_of_scope');const compileInput={processes:current.scope.processes,links:current.scope.links,routes:candidate.routes,bindings:candidate.bindings},review=await this.graph.preview(actor,compileInput),after=await this.build(actor,q.scope);if(after.contextHash!==current.contextHash)throw Error('planning_context_changed');return {candidate,contextHash:current.contextHash,requiresInput:false,compileInput,planHash:review.planHash,taskCount:review.taskCount,persisted:false,businessAuthorized:false,executed:false};
 }
}
