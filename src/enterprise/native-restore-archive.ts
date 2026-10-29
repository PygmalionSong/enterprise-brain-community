// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Restore provenance is issued only after full authentication and current-code checks.
// 恢复来源凭据仅在完整认证、当前代码和迁移核对后签发。
import {createHash} from 'node:crypto';import {join} from 'node:path';import {z} from 'zod';
import {verifyNativeArchive,type VerifiedNativeArchive} from './native-archive.ts';
import {codeFingerprint} from './code-fingerprint.ts';import {readSchemaInventory} from '../db/schema-health.ts';
const request=z.object({trustedSourceAcknowledged:z.literal(true),maxBytes:z.number().int().min(1).max(4294967296).default(268435456),timeoutMs:z.number().int().min(100).max(300000).default(60000)}).strict();
type Proof={root:string;codeSha256:string;migrations:Awaited<ReturnType<typeof readSchemaInventory>>};
const proofs=new WeakMap<VerifiedNativeArchive,Proof>();
export async function authenticateNativeRestoreArchive(root:string,directory:string,keyFile:string,input:unknown){
 const q=request.parse(input),codeSha256=await codeFingerprint(root),migrations=await readSchemaInventory(join(root,'migrations')),migrationsSha256=createHash('sha256').update(JSON.stringify(migrations)).digest('hex');
 const token=await verifyNativeArchive(directory,keyFile,{maxBytes:q.maxBytes,timeoutMs:q.timeoutMs});
 if(!token.scope.database||!token.inventory)throw Error('native_restore_provenance_required');
 if(token.scope.codeSha256!==codeSha256||token.scope.migrationsSha256!==migrationsSha256||await codeFingerprint(root)!==codeSha256)throw Error('native_restore_code_mismatch');
 proofs.set(token,{root,codeSha256,migrations});return token;
}
export function nativeRestoreArchiveIdentity(token:VerifiedNativeArchive){const q=proofs.get(token);if(!q||!token.scope.database||!token.inventory)throw Error('native_restore_authentication_required');return Object.freeze({root:q.root,codeSha256:q.codeSha256,enterpriseId:token.scope.enterpriseId,database:token.scope.database,inventory:token.inventory,migrations:structuredClone(q.migrations)});}
export async function recheckNativeRestoreArchive(token:VerifiedNativeArchive){const q=nativeRestoreArchiveIdentity(token);if(await codeFingerprint(q.root)!==q.codeSha256)throw Error('native_restore_code_changed');return q;}
