// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
import{canonicalPathEqual,canonicalPathKey}from'../platform/canonical-path.ts';
// Operators install pinned local adapters; model/source text never selects executable code.
// 运维安装固定本机适配器；模型或源端文字不选择可执行代码。
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Database} from '../db/adapter.ts';
import type {Actor} from '../identity/service.ts';
import {GraphToolCatalog,type GraphTool} from '../runtime/graph-contracts.ts';
import {enterpriseGraphTools} from '../runtime/enterprise-tools.ts';
import {compileToolArguments} from '../runtime/tool-argument-schema.ts';
import {McpGraphClient,mcpGraphContractSchema} from '../runtime/mcp-graph-tool.ts';
import {StdioProcessTransport,stdioProcessConfig} from '../connectors/mcp-stdio.ts';
import {hash} from '../runtime/contracts.ts';
import {readPrivateJson} from './configuration.ts';
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const absolute=z.string().max(1024).refine(v=>isAbsolute(v)&&resolve(v)===v);
export const toolInstallationSchema=z.object({format:z.literal(1),installationAcknowledged:z.literal(true),tools:z.array(z.object({id:z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/).refine(v=>v!=='process.definition.read'),effect:z.enum(['read','delegated']),roles:z.array(z.enum(['executive','operations'])).min(1).max(2).refine(v=>new Set(v).size===v.length),arguments:z.unknown(),server:stdioProcessConfig,artifacts:z.array(z.object({file:absolute,sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1).max(8),contract:mcpGraphContractSchema}).strict()).min(1).max(16)}).strict().refine(q=>new Set(q.tools.map(t=>t.id)).size===q.tools.length,'duplicate_tool_installation');
export async function inspectToolInstallation(file:string){
 const value=toolInstallationSchema.parse(await readPrivateJson(file,256*1024)),fingerprint=hash(value),artifacts=new Map<string,{file:string;sha256:string}>();
 for(const tool of value.tools){compileToolArguments(tool.arguments);if(new Set(tool.artifacts.map(a=>canonicalPathKey(a.file))).size!==tool.artifacts.length||!tool.artifacts.some(a=>a.file===tool.server.command))throw Error('enterprise_tool_artifact_required');for(const artifact of tool.artifacts){const prior=artifacts.get(canonicalPathKey(artifact.file));if(prior&&prior.sha256!==artifact.sha256)throw Error('enterprise_tool_artifact_changed');artifacts.set(canonicalPathKey(artifact.file),artifact);}if(tool.server.cwd&&!canonicalPathEqual((await realpath(tool.server.cwd)),resolve(tool.server.cwd)))throw Error('enterprise_tool_artifact_invalid');}
 let total=0;for(const artifact of artifacts.values()){const info=await lstat(artifact.file);if(!info.isFile()||info.isSymbolicLink()||(total+=info.size)>128*1024*1024||!canonicalPathEqual((await realpath(artifact.file)),artifact.file))throw Error('enterprise_tool_artifact_invalid');if(sha(await readFile(artifact.file))!==artifact.sha256)throw Error('enterprise_tool_artifact_changed');}return {value,fingerprint};
}
export async function installedEnterpriseTools(db:Database,file?:string,installationGuard?:()=>Promise<void>){const defaults=enterpriseGraphTools(db);if(!file)return defaults;const installation=await inspectToolInstallation(file),extra:GraphTool[]=[];
 for(const descriptor of installation.value.tools){const validate=compileToolArguments(descriptor.arguments),version='mcp_'+hash({installation:installation.fingerprint,id:descriptor.id});
  const authorize=async(actor:Actor,args:Record<string,unknown>)=>{await installationGuard?.();validate(args);if((await inspectToolInstallation(file)).fingerprint!==installation.fingerprint)throw Error('enterprise_tool_installation_changed');const p=(await db.query<any>('SELECT role,disabled,authorization_version FROM principal WHERE enterprise_id=$1 AND id=$2',[actor.enterpriseId,actor.id])).rows[0];if(!p||p.disabled||p.role!==actor.role||!descriptor.roles.includes(p.role)||Number(p.authorization_version)!==actor.authorizationVersion)throw Error('not_authorized');};
  const call=async(kind:'submit'|'lookup',actor:Actor,args:Record<string,unknown>,reference:string,signal:AbortSignal)=>{await authorize(actor,args);if(signal.aborted)throw Error('mcp_graph_aborted');const client=new McpGraphClient(new StdioProcessTransport(descriptor.server,'graph-tools'),descriptor.contract);return client.call(kind,actor,args,reference,signal,()=>authorize(actor,args));};
  extra.push({id:descriptor.id,version,effect:descriptor.effect,inputSchema:descriptor.arguments as Record<string,unknown>,validate,authorize,submit:(actor,args,id,signal)=>call('submit',actor,args,id,signal),lookup:(actor,args,id,signal)=>call('lookup',actor,args,id,signal)});
 }
 return new GraphToolCatalog([...defaults.describe().map(d=>defaults.get(d.id,d.version)),...extra]);
}
