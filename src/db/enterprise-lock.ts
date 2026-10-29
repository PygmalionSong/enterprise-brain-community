// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// A successful SELECT can return zero rows under RLS: require the exact parent row lock.
// RLS下SELECT成功可能返回零行；必须确认实际锁到本企业父行。
import type {Sql} from './adapter.ts';
export async function requireEnterpriseLock(tx:Sql,enterpriseId:string,mode:'update'|'share'='update'){
 if(mode!=='update'&&mode!=='share')throw Error('invalid_enterprise_lock_mode');
 const rows=(await tx.query<{id:string}>('SELECT id FROM enterprise WHERE id=$1 FOR '+(mode==='update'?'UPDATE':'SHARE'),[enterpriseId])).rows;
 if(rows.length!==1||rows[0].id!==enterpriseId)throw Error('not_authorized');
}
