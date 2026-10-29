// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Separate canonical TLS origin and private proxy authority from caller headers.
// 规范TLS来源与私人代理授权独立于调用方头字段。
import {timingSafeEqual} from 'node:crypto';
import type {IncomingMessage} from 'node:http';
import {z} from 'zod';
const secret=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const enterpriseHostSchema=z.object({enterpriseId:z.uuid(),instanceId:z.uuid(),origin:z.string().max(300).refine(value=>{try{const u=new URL(value);return u.protocol==='https:'&&u.origin===value&&!u.username&&!u.password;}catch{return false;}},'canonical_https_origin_required'),proxyToken:secret,controlToken:secret}).strict();
export type EnterpriseHostConfiguration=z.infer<typeof enterpriseHostSchema>;
export function secretMatches(supplied:unknown,expected:string){if(typeof supplied!=='string'||supplied.length!==expected.length)return false;const a=Buffer.from(supplied),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
export function localBackendRequest(req:IncomingMessage){const address=req.socket.remoteAddress??'',host=req.headers.host??'';if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address))return false;const match=/^(?:localhost|127\.0\.0\.1):([0-9]+)$/.exec(host);return Boolean(match&&Number(match[1])===req.socket.localPort);}
export function canonicalRequestUrl(req:IncomingMessage,origin:string){const raw=req.url??'';if(!raw.startsWith('/')||raw.startsWith('//')||raw.includes('\\'))throw Error('invalid_request');const url=new URL(raw,origin);if(url.origin!==origin)throw Error('invalid_request');return url;}
