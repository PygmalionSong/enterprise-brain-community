// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Pure planning contracts; a validated plan is never a network or business grant.
// 纯计划合同：计划通过校验不等于获得网络探测或业务执行授权。
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {z} from 'zod';

export const discoveryLimits = Object.freeze({
  inputTargets: 256, uniqueTargets: 64, responseBytes: 256 * 1024,
  concurrency: 4, requestTimeoutMs: 5000, totalTimeoutMs: 120000,
});
const tenant = z.uuid();
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

export function canonicalDiscoveryEndpoint(input: string): string {
  if (typeof input !== 'string' || !input.length || input.length > 2048 ||
      /[\s\x00-\x1f\x7f\\?#]/u.test(input)) throw Error('discovery_endpoint_invalid');
  const form = /^https?:\/\/([^/]+)(\/.*)?$/i.exec(input);
  if (!form || form[1].includes('@')) throw Error('discovery_endpoint_invalid');
  // Reject transformations that could conceal the target from the reviewer.
  // 拒绝可能向核对人隐藏实际目标的URL变换。
  try {
    for (const segment of (form[2] ?? '/').split('/')) {
      const decoded = decodeURIComponent(segment);
      if (['.', '..'].includes(decoded) || /[\/\\?#\x00-\x1f\x7f]/u.test(decoded))
        throw Error('discovery_endpoint_invalid');
    }
  } catch { throw Error('discovery_endpoint_invalid'); }
  let url: URL;
  try { url = new URL(input); } catch { throw Error('discovery_endpoint_invalid'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname ||
      url.username || url.password || url.port === '0') throw Error('discovery_endpoint_invalid');
  // Do not silently turn an ambiguous trailing-dot host into an identity alias.
  // 不把尾点主机名静默转换为身份别名。
  if (url.hostname.endsWith('.')) throw Error('discovery_endpoint_invalid');
  const rawHost = form[1].startsWith('[') ? form[1].slice(0, form[1].indexOf(']') + 1) : form[1].split(':')[0];
  if (isIP(url.hostname) === 4 && rawHost !== url.hostname) throw Error('discovery_endpoint_invalid');
  return url.href;
}

export function discoveryAssetId(enterpriseId: string, endpoint: string): string {
  return 'asset_' + sha(tenant.parse(enterpriseId).toLowerCase() + '\n' + canonicalDiscoveryEndpoint(endpoint));
}

// Planning and I/O share the same declared transport subset. Unsupported assets
// can be catalogued, but are never silently sent to a different transport.
// 计划与I/O共用相同支持子集；可登记未支持资产，不静默改用其他传输。
export function discoveryProbePolicy(endpoint: string) {
  const url = new URL(canonicalDiscoveryEndpoint(endpoint));
  if (isIP(url.hostname) !== 4)
    return {probeSupported: false, probeCode: 'discovery_literal_ipv4_required'};
  const [a, b, , d] = url.hostname.split('.').map(Number);
  const privateAddress = a === 10 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168;
  if (url.hostname !== '127.0.0.1' && (!privateAddress || d === 0 || d === 255))
    return {probeSupported: false, probeCode: 'discovery_address_not_supported'};
  return {probeSupported: true, probeCode: 'discovery_probe_ready'};
}

export function planDiscoveryTargets(enterpriseId: string, inputs: string[]) {
  const id = tenant.parse(enterpriseId).toLowerCase();
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > discoveryLimits.inputTargets)
    throw Error('discovery_target_limit');
  const endpoints = [...new Set(inputs.map(canonicalDiscoveryEndpoint))].sort();
  if (endpoints.length > discoveryLimits.uniqueTargets) throw Error('discovery_target_limit');
  const targets = Object.freeze(endpoints.map(endpoint => Object.freeze({
    assetId: discoveryAssetId(id, endpoint), endpoint, ...discoveryProbePolicy(endpoint),
  })));
  // Bind resource bounds and policy to the same digest as the endpoint set.
  // 资源上限、策略与端点集合绑定到同一个摘要，不留可静默变更的旁路字段。
  const limits = Object.freeze({...discoveryLimits});
  const payload = {format: 'enterprise-brain.discovery-plan/1' as const,
    policyVersion: 'explicit-private-ipv4-metadata/1' as const, enterpriseId: id, targets, limits};
  return Object.freeze({
    ...payload, planSha256: sha(JSON.stringify(payload)),
    inputCount: inputs.length, duplicateCount: inputs.length - targets.length,
    networkAuthorized: false as const,
    readAuthorized: false as const, executable: false as const,
  });
}

// Only the finite task lifecycle is checked here. Live identity/expiry belongs to
// the future server transaction, never to caller-supplied booleans or model text.
// 此处只校验有限任务状态；真实身份/期限由服务端事务核对，不信任调用方或模型布尔值。
export type DiscoveryRunState = 'draft' | 'authorized' | 'running' | 'completed' |
  'partial' | 'cancelled' | 'expired' | 'unknown';
const transitions: Record<DiscoveryRunState, readonly DiscoveryRunState[]> = {
  draft: ['authorized', 'cancelled', 'expired'],
  authorized: ['running', 'cancelled', 'expired'],
  running: ['completed', 'partial', 'cancelled', 'expired', 'unknown'],
  unknown: ['cancelled', 'expired'],
  completed: [], partial: [], cancelled: [], expired: [],
};
export function checkDiscoveryTransition(from: DiscoveryRunState, to: DiscoveryRunState) {
  if (!Object.hasOwn(transitions, from) || !transitions[from].includes(to))
    throw Error('discovery_transition_invalid');
  return to;
}
