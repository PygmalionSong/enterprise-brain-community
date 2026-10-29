// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Persist only bounded evidence fields, never raw source content or authority.
// 只持久化有界证据字段，不保存源端正文或执行权限。
import {z} from 'zod';
export const observationSchema = z.object({
  format: z.literal('enterprise-brain.discovery-observation/1'),
  status: z.number().int().min(100).max(599), bytes: z.number().int().min(0).max(262144),
  ruleVersion: z.literal('1'), rawSha256: z.string().regex(/^[a-f0-9]{64}$/),
  protocol: z.enum(['odata-json-csdl','mcp-initialize']).nullable(),
  protocolVersion: z.enum(['4.01','2025-11-25']).nullable(),
  outcome: z.enum(['protocol_identified','needs_authorization','unknown','unsupported']),
  evidence: z.enum(['none','validated_schema','source_declared_capabilities']),
  code: z.enum(['unrecognized_response','credentials_required','redirect_not_followed',
    'response_not_successful','content_type_unsupported','response_json_invalid',
    'odata_schema_validated','odata_subset_unsupported','mcp_version_unsupported','mcp_initialize_observed']),
  vendorProduct: z.null(), vendorVersion: z.null(), metadataReadableCandidate: z.boolean(),
  resourcesAdvertised: z.boolean(), toolsAdvertised: z.boolean(),
  processDefinitionAvailable: z.literal(false), confirmed: z.literal(false),
  readAuthorized: z.literal(false), executable: z.literal(false),
}).strict().superRefine((v,c) => {
  const odata = v.protocol === 'odata-json-csdl', mcp = v.protocol === 'mcp-initialize';
  if (v.outcome === 'protocol_identified' && !(odata || mcp) ||
      (odata || mcp) && (v.outcome !== 'protocol_identified' || v.status !== 200) ||
      odata && (v.protocolVersion !== '4.01' || v.code !== 'odata_schema_validated' || v.evidence !== 'validated_schema') ||
      mcp && (v.protocolVersion !== '2025-11-25' || v.code !== 'mcp_initialize_observed' || v.evidence !== 'source_declared_capabilities') ||
      !odata && v.metadataReadableCandidate || !mcp && (v.resourcesAdvertised || v.toolsAdvertised) ||
      v.protocol === null && (v.protocolVersion !== null || v.evidence !== 'none'))
    c.addIssue({code:'custom',message:'observation_inconsistent'});
});
export type StoredObservation = z.infer<typeof observationSchema>;
