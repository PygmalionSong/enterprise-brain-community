// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Server storage selection; test database adapters may still use explicit memory.
// 服务端存储选择；隔离测试适配器仍可显式使用内存模式。
import {resolve} from 'node:path';
export function serverDatabaseLocation(root:string,env:Record<string,string|undefined>){
 const configured=env.DATABASE_URL?.trim();
 if(!configured)return resolve(root,'.data/postgres-wasm');
 if(!/^postgres(?:ql)?:\/\//.test(configured))throw Error('invalid_database_url');
 return configured;
}
