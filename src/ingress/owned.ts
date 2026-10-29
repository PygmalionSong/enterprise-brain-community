// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Persistent owned fixture key is included in encrypted application-volume recovery only.
// 构造源密钥仅保留在应用数据卷，并随加密备份恢复，不进入发行文件。
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {DEMO_ENTERPRISE} from '../industry/seed.ts';
import type {EventProfile} from './events.ts';
export async function ownedEventProfiles(root:string):Promise<EventProfile[]>{const directory=join(root,'.data/source-sql');await mkdir(directory,{recursive:true});const file=join(directory,'owned-event-signing.key');try{await writeFile(file,randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}const readKey=async()=>{const key=await readFile(file);if(key.length!==32)throw Error('event_key_invalid');return key;};await readKey();return [{enterpriseId:DEMO_ENTERPRISE,connectionId:'CON-09',keyRef:'owned://crm-events-v1',readKey}];}
