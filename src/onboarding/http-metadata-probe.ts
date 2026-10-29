// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Internal transport for explicitly authorized literal private IPv4 endpoints.
// 内部传输：仅面向已明确授权的私网IPv4字面地址，不枚举网段、不解析DNS。
import http from 'node:http';
import https from 'node:https';
import {canonicalDiscoveryEndpoint, discoveryProbePolicy, discoveryLimits} from './discovery-contracts.ts';
import {inspectProtocolObservation} from './protocol-observation.ts';

export interface DiscoveryProbeAuthority {
  // A future authenticated server adapter must check current tenant/principal,
  // exact scope, version, expiry and revocation both before I/O and publication.
  // 后续服务器适配器须前后重验企业、身份、精确范围、版本、期限和撤权。
  check(endpoint: string, phase: 'before_request' | 'before_accept'): Promise<void>;
}
const allowedErrors = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID',
]);
function target(endpoint: string) {
  const canonical = canonicalDiscoveryEndpoint(endpoint), url = new URL(canonical);
  const policy = discoveryProbePolicy(canonical);
  if (!policy.probeSupported) throw Error(policy.probeCode);
  return {canonical, url};
}
export async function probeHttpMetadata(endpoint: string, authority: DiscoveryProbeAuthority, signal?: AbortSignal) {
  const selected = target(endpoint);
  const abort = new AbortController();
  const onCancel = () => abort.abort(Error('discovery_cancelled'));
  signal?.addEventListener('abort', onCancel, {once: true});
  if (signal?.aborted) onCancel();
  const timer = setTimeout(() => abort.abort(Error('discovery_request_deadline')), discoveryLimits.requestTimeoutMs);
  let request: http.ClientRequest | undefined;
  let response: http.IncomingMessage | undefined;
  const aborted = () => {
    const error = abort.signal.reason instanceof Error ? abort.signal.reason : Error('discovery_cancelled');
    request?.destroy(error); response?.destroy(error);
  };
  abort.signal.addEventListener('abort', aborted);
  const guard = async (phase: 'before_request' | 'before_accept') => {
    abort.signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const cancel = () => reject(abort.signal.reason);
      abort.signal.addEventListener('abort', cancel, {once: true});
      // Never emit source/server authority errors, which may include private values.
      // 不输出可能带私人信息的服务端授权异常。
      Promise.resolve().then(() => authority.check(selected.canonical, phase)).then(resolve, () => reject(Error('discovery_authority_unavailable')))
        .finally(() => abort.signal.removeEventListener('abort', cancel));
    });
    abort.signal.throwIfAborted();
  };
  try {
    await guard('before_request');
    const captured = await new Promise<{status: number; contentType: string; body: string}>((resolve, reject) => {
      const transport = selected.url.protocol === 'https:' ? https : http;
      request = transport.request({
        protocol: selected.url.protocol, hostname: selected.url.hostname,
        port: selected.url.port || (selected.url.protocol === 'https:' ? 443 : 80),
        path: selected.url.pathname, method: 'GET', agent: false, maxHeaderSize: 8192,
        rejectUnauthorized: true,
        headers: {Accept: 'application/json', 'Accept-Encoding': 'identity', Connection: 'close'},
      }, incoming => {
        response = incoming;
        incoming.on('error', reject);
        const status = incoming.statusCode ?? 0;
        const contentType = incoming.headers['content-type'] ?? '';
        // Refuse redirection/auth pages without consuming their body or Location.
        // 不读取重定向/登录响应正文，也不跟随Location。
        if (status !== 200) { resolve({status, contentType, body: ''}); incoming.destroy(); return; }
        if (incoming.headers['content-encoding'] && incoming.headers['content-encoding'] !== 'identity') {
          reject(Error('discovery_content_encoding_unsupported')); incoming.destroy(); return;
        }
        let bytes = 0;
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > discoveryLimits.responseBytes) {
            reject(Error('discovery_response_size_limit')); incoming.destroy(); request?.destroy(); return;
          }
          chunks.push(chunk);
        });
        incoming.on('end', () => {
          try {
            const body = new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks));
            resolve({status, contentType, body});
          } catch { reject(Error('discovery_response_encoding_invalid')); }
        });
      });
      request.on('error', reject);
      // A cancellation between authority validation and request creation cannot send.
      // 授权校验与请求创建之间发生取消时不得发送。
      if (abort.signal.aborted) { aborted(); return; }
      request.end();
    });
    await guard('before_accept');
    const observation = inspectProtocolObservation(captured);
    // This is an uncommitted candidate. Only an authenticated atomic database
    // acceptance transaction may publish it as durable discovery evidence.
    // 此处只是未提交候选；只有真实身份下的原子数据库事务可发布持久发现证据。
    return {status: 'observed' as const, observation, evidenceCommitted: false as const,
      networkPolicy: 'explicit_private_ipv4' as const};
  } catch (error) {
    const e = error as NodeJS.ErrnoException;
    const code = abort.signal.aborted
      ? (signal?.aborted ? 'discovery_cancelled' : 'discovery_request_deadline')
      : /^discovery_[a-z_]+$/.test(e.message ?? '') ? e.message
      : allowedErrors.has(e.code ?? '') ? e.code! : 'discovery_transport_unavailable';
    return {status: 'unavailable' as const, observation: null, code,
      networkPolicy: 'explicit_private_ipv4' as const};
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', onCancel);
    abort.signal.removeEventListener('abort', aborted);
    response?.destroy(); request?.destroy();
  }
}
