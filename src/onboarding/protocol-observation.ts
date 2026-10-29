// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Response classification only: no fetch, redirects, tool calls or authority.
// 仅分类已取得的响应：不发网络请求、不跳转、不调用工具、不产生授权。
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {readODataCsdl} from '../connectors/odata-csdl.ts';
import {MCP_PROCESS_VERSION} from '../connectors/mcp-process-reader.ts';
import {discoveryLimits} from './discovery-contracts.ts';

const responseSchema = z.object({
  status: z.number().int().min(100).max(599),
  contentType: z.string().max(160), body: z.string(),
}).strict();
const initializeResult = z.object({
  protocolVersion: z.string().max(80),
  capabilities: z.object({resources: z.object({}).optional(), tools: z.object({}).optional()}),
  serverInfo: z.object({name: z.string().min(1).max(160), version: z.string().min(1).max(80)}),
});
export type DiscoveryOutcome = 'protocol_identified' | 'needs_authorization' | 'unknown' | 'unsupported';
export type ObservationProtocol = 'odata-json-csdl' | 'mcp-initialize' | null;
const contextSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('http-get')}).strict(),
  z.object({kind: z.literal('mcp-initialize'), expectedRequestId: z.union([
    z.string().min(1).max(80), z.number().int().safe(),
  ])}).strict(),
]);
export function inspectProtocolObservation(input: unknown, context: unknown = {kind: 'http-get'}) {
  const probe = contextSchema.parse(context);
  const response = responseSchema.parse(input);
  const bytes = Buffer.byteLength(response.body);
  const base = {
    format: 'enterprise-brain.discovery-observation/1' as const,
    status: response.status, bytes, ruleVersion: '1',
    rawSha256: bytes <= discoveryLimits.responseBytes
      ? createHash('sha256').update(response.body).digest('hex') : null,
    protocol: null as ObservationProtocol, protocolVersion: null as string | null,
    outcome: 'unknown' as DiscoveryOutcome, evidence: 'none', code: 'unrecognized_response',
    vendorProduct: null, vendorVersion: null,
    metadataReadableCandidate: false, resourcesAdvertised: false, toolsAdvertised: false,
    processDefinitionAvailable: false, confirmed: false, readAuthorized: false, executable: false,
  };
  if (bytes > discoveryLimits.responseBytes) return {...base, code: 'response_size_limit'};
  if ([401, 403].includes(response.status))
    return {...base, outcome: 'needs_authorization' as const, code: 'credentials_required'};
  if (response.status >= 300 && response.status < 400) return {...base, code: 'redirect_not_followed'};
  if (response.status !== 200) return {...base, code: 'response_not_successful'};
  const mime = response.contentType.split(';')[0].trim().toLowerCase();
  if (!(mime === 'application/json' || /^application\/[a-z0-9.+-]+\+json$/.test(mime)))
    return {...base, code: 'content_type_unsupported'};
  let parsed: unknown;
  try { parsed = JSON.parse(response.body); } catch { return {...base, code: 'response_json_invalid'}; }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return base;
  const value = parsed as Record<string, unknown>;
  if (probe.kind === 'http-get' && Object.hasOwn(value, '$Version')) {
    try {
      const metadata = readODataCsdl(response.body);
      return {...base, outcome: 'protocol_identified' as const, protocol: 'odata-json-csdl' as const,
        protocolVersion: metadata.version, evidence: 'validated_schema', code: 'odata_schema_validated',
        metadataReadableCandidate: true};
    } catch {
      return {...base, outcome: 'unsupported' as const, code: 'odata_subset_unsupported'};
    }
  }
  // Only a bounded initialize envelope is evidence. Ordinary JSON with a
  // serverInfo field, an MCP-looking title or hostile instructions is not enough.
  // 只认明确初始化信封，普通serverInfo、标题或恶意指令均不是协议证据。
  if (probe.kind !== 'mcp-initialize' || value.id !== probe.expectedRequestId ||
      value.jsonrpc !== '2.0' || !Object.hasOwn(value, 'id') ||
      !['string', 'number'].includes(typeof value.id) || Object.hasOwn(value, 'error')) return base;
  const result = initializeResult.safeParse(value.result);
  if (!result.success) return base;
  if (result.data.protocolVersion !== MCP_PROCESS_VERSION)
    return {...base, outcome: 'unsupported' as const, code: 'mcp_version_unsupported'};
  return {...base, outcome: 'protocol_identified' as const, protocol: 'mcp-initialize' as const,
    protocolVersion: MCP_PROCESS_VERSION, evidence: 'source_declared_capabilities',
    code: 'mcp_initialize_observed',
    resourcesAdvertised: result.data.capabilities.resources !== undefined,
    toolsAdvertised: result.data.capabilities.tools !== undefined};
}
