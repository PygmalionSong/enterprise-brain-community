// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Versioned interruption evidence; neither schema is an execution capability.
// 有版本的中断证据；解析成功不授予执行权限。
import {z} from 'zod';
import {linuxReadySchema,linuxRecordedTaskStopped} from '../platform/linux-systemd.ts';
import {processExists} from './operation-guard.ts';
const sha=z.string().regex(/^[a-f0-9]{64}$/),pid=z.number().int().positive();
export const windowsWorkerReadySchema=z.object({format:z.literal(1),taskId:z.uuid(),keeperPid:pid,childPid:pid,suspendedAssignment:z.literal(true),killOnClose:z.literal(true)}).strict();
const common={targetId:z.uuid(),backupId:z.uuid(),inputSha256:sha,readySha256:sha};
export const nativeRestoreWorkerRecordSchema=z.union([
 z.object({...common,format:z.literal(1),identity:windowsWorkerReadySchema,state:z.literal('child_suspended')}).strict(),
 z.object({...common,format:z.literal(2),platform:z.literal('linux-systemd-user-v1'),identity:linuxReadySchema,state:z.literal('worker_ready')}).strict()
]);
export async function nativeRestoreWorkerStopped(value:unknown){const q=nativeRestoreWorkerRecordSchema.parse(value);return q.format===2?linuxRecordedTaskStopped(q.identity):!processExists(q.identity.keeperPid)&&!processExists(q.identity.childPid);}
