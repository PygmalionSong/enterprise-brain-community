// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// MCP transports a source-owned idempotent contract, not arbitrary tool text as completion.
// MCP传递源端幂等合同，不能把普通工具文字当业务完成。
import {z} from 'zod';
import {MCP_PROCESS_VERSION,type ProcessRpcTransport} from '../connectors/mcp-process-reader.ts';
import {graphResultSchema} from './graph-contracts.ts';
import {hash} from './contracts.ts';
import type {Actor} from '../identity/service.ts';
const name=z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/),sha=z.string().regex(/^[a-f0-9]{64}$/);
export const mcpGraphContractSchema=z.object({format:z.literal('enterprise-brain.graph-tool/1'),serverInfo:z.object({name:z.string().min(1).max(160),version:z.string().min(1).max(80)}).strict(),submit:z.object({name,descriptorSha256:sha}).strict(),lookup:z.object({name,descriptorSha256:sha}).strict()}).strict().refine(c=>c.submit.name!==c.lookup.name,'mcp_graph_distinct_methods_required');
export type McpGraphContract=z.infer<typeof mcpGraphContractSchema>;
export class McpGraphClient {
 private transport:ProcessRpcTransport;private contract:McpGraphContract;
 constructor(transport:ProcessRpcTransport,contract:unknown){this.transport=transport;this.contract=mcpGraphContractSchema.parse(contract);}
 private async initialize(){const reply=z.object({protocolVersion:z.literal(MCP_PROCESS_VERSION),capabilities:z.object({tools:z.object({}).passthrough()}).passthrough(),serverInfo:z.object({name:z.string(),version:z.string()}).passthrough()}).passthrough().parse(await this.transport.request('initialize',{protocolVersion:MCP_PROCESS_VERSION,capabilities:{},clientInfo:{name:'enterprise-brain-graph-bridge',version:'0.1.0'}}));if(reply.serverInfo.name!==this.contract.serverInfo.name||reply.serverInfo.version!==this.contract.serverInfo.version)throw Error('mcp_graph_server_changed');await this.transport.notify('notifications/initialized');
  let cursor:string|undefined,count=0;const cursors=new Set<string>(),descriptors=new Map<string,Record<string,unknown>>();for(let page=0;page<10;page++){const result=z.object({tools:z.array(z.object({name,inputSchema:z.record(z.string(),z.unknown())}).passthrough()).max(100),nextCursor:z.string().min(1).max(512).optional()}).passthrough().parse(await this.transport.request('tools/list',cursor?{cursor}:{}));count+=result.tools.length;if(count>200)throw Error('mcp_graph_tool_limit');for(const item of result.tools){if(descriptors.has(item.name))throw Error('mcp_graph_duplicate_tool');descriptors.set(item.name,item);}if(!result.nextCursor){for(const descriptor of [this.contract.submit,this.contract.lookup]){const value=descriptors.get(descriptor.name);if(!value||hash(value)!==descriptor.descriptorSha256)throw Error('mcp_graph_descriptor_changed');}return;}if(cursors.has(result.nextCursor))throw Error('mcp_graph_cursor_repeated');cursors.add(result.nextCursor);cursor=result.nextCursor;}throw Error('mcp_graph_page_limit');
 }
 async call(kind:'submit'|'lookup',actor:Actor,args:Record<string,unknown>,reference:string,signal:AbortSignal,beforeCall?:()=>Promise<void>){z.uuid().parse(reference);if(!['submit','lookup'].includes(kind))throw Error('mcp_graph_method_denied');const abort=()=>{void this.transport.close().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});try{if(signal.aborted)throw Error('mcp_graph_aborted');await this.initialize();await beforeCall?.();if(signal.aborted)throw Error('mcp_graph_aborted');const response=z.object({content:z.array(z.unknown()).max(16).default([]),structuredContent:z.unknown(),isError:z.boolean().optional()}).passthrough().parse(await this.transport.request('tools/call',{name:this.contract[kind].name,arguments:{reference,arguments:args,actor:{enterpriseId:actor.enterpriseId,principalId:actor.id,authorizationVersion:actor.authorizationVersion,role:actor.role}}}));if(response.isError)throw Error('mcp_graph_source_error');const result=graphResultSchema.parse(response.structuredContent);if(result.reference!==reference)throw Error('mcp_graph_reference_mismatch');return result;}finally{signal.removeEventListener('abort',abort);await this.transport.close();}}
}
