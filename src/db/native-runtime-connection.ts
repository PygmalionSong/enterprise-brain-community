// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
import{canonicalPathEqual}from'../platform/canonical-path.ts';
// Explicit trusted runtime connection only;no migrations or enterprise host activation.
// 显式受信运行连接；不迁移、不激活企业宿主。
import {readFile,lstat,realpath} from 'node:fs/promises';import {isAbsolute,resolve,dirname} from 'node:path';import {X509Certificate,randomUUID,createHash} from 'node:crypto';
import pg from 'pg';import {z} from 'zod';import type {Database} from './adapter.ts';import type {SchemaInventory} from './schema-health.ts';import {inspectNativeRuntime} from './native-runtime-preflight.ts';
const absolute=z.string().max(1024).refine(v=>isAbsolute(v)&&resolve(v)===v);
const name=z.string().regex(/^[a-z][a-z0-9_]{0,62}$/);
const host=z.string().min(1).max(253).refine(v=>v==='::1'||/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(v));
export const nativeRuntimeDescriptorSchema=z.object({format:z.literal(1),host,port:z.number().int().min(1024).max(65535),database:name,runtimeRole:name,enterpriseId:z.uuid(),passwordFile:absolute,tls:z.discriminatedUnion('mode',[z.object({mode:z.literal('verify-full'),caFile:absolute}).strict(),z.object({mode:z.literal('owned-loopback-test'),plaintextAcknowledged:z.literal(true)}).strict()])}).strict().refine(v=>v.tls.mode!=='owned-loopback-test'||['127.0.0.1','::1'].includes(v.host));
// Provenance of the connection policy only;current privileges still require fresh checks.
// 仅证明连接策略来源；当前权限仍须重新检查。
export type NativeRuntimeOwnership=Readonly<{isActive:()=>boolean;release:()=>Promise<void>}>;
type ConnectionState={enterpriseId:string;runtimeRole:string;mode:string;descriptorSha256:string;runtimeId:string;options:pg.ClientConfig;used:boolean;owner?:NativeRuntimeOwnership};
const verifiedConnections=new WeakMap<Database,ConnectionState>();
export function isVerifiedNativeRuntimeConnection(db:Database,enterpriseId:string,runtimeRole:string,expectedDescriptorSha256?:string){const q=verifiedConnections.get(db);return !!q&&q.mode==='verify-full'&&q.enterpriseId===enterpriseId&&q.runtimeRole===runtimeRole&&(expectedDescriptorSha256===undefined||q.descriptorSha256===expectedDescriptorSha256);}
// Private task helpers can bind another connection to the same actual advisory owner.
// 私人任务辅助函数可把另一连接绑定到实际同库归属，不接受伪造的外部数据库对象。
export function nativeRuntimeOwnershipIdentity(db:Database,enterpriseId:string,runtimeRole:string,descriptorSha256:string){const q=verifiedConnections.get(db);if(!q||!isVerifiedNativeRuntimeConnection(db,enterpriseId,runtimeRole,descriptorSha256)||!q.owner?.isActive())throw Error('native_runtime_ownership_unavailable');return Object.freeze({runtimeId:q.runtimeId});}
const ownershipInput=z.object({ownershipAcknowledged:z.literal(true)}).strict();
// Session lock belongs to a separate stable client,not a pooled or open-transaction lease.
// 会话锁归单独稳定客户端持有，不用随机池连接或长事务冒充归属。
export async function acquireNativeRuntimeOwnership(db:Database,input:unknown,onLost?:()=>void):Promise<NativeRuntimeOwnership>{
 if(!ownershipInput.safeParse(input).success||onLost!==undefined&&typeof onLost!=='function')throw Error('native_runtime_ownership_input_invalid');
 const state=verifiedConnections.get(db);if(!state||state.mode!=='verify-full')throw Error('native_runtime_verified_connection_required');if(state.used)throw Error('native_runtime_ownership_connection_used');
 if(Object.entries(process.env).some(([key,value])=>/^PG/i.test(key)&&value))throw Error('native_runtime_environment_conflict');
 const client=new pg.Client({...state.options,application_name:'eb-owner:'+state.runtimeId,query_timeout:3000});let active=false,published=false,releasing:Promise<void>|undefined;
 const lost=()=>{if(!active)return;active=false;verifiedConnections.delete(db);if(published)try{onLost?.();}catch{}};client.on('error',lost);client.on('end',lost);
 const release=()=>releasing??=(async()=>{const wasActive=active;active=false;try{if(wasActive)await client.query('SELECT pg_catalog.pg_advisory_unlock(71245120,1)');}catch{}finally{await client.end().catch(()=>{});}})();
 try{
  await client.connect();const lock=(await client.query('SELECT pg_catalog.pg_try_advisory_lock(71245120,1) AS acquired')).rows[0];if(lock?.acquired!==true)throw Error('native_runtime_database_in_use');active=true;
  const peers=(await client.query("SELECT count(*)::integer n FROM pg_catalog.pg_stat_activity WHERE datname=current_database() AND application_name LIKE 'eb-runtime:%' AND application_name<>$1",['eb-runtime:'+state.runtimeId])).rows[0];if(!peers||Number(peers.n)!==0)throw Error('native_runtime_previous_connections_present');
  const owner=Object.freeze({isActive:()=>active,release});state.used=true;state.owner=owner;published=true;return owner;
 }catch(e){await release();const code=e instanceof Error?e.message:'';throw Error(['native_runtime_database_in_use','native_runtime_previous_connections_present'].includes(code)?code:'native_runtime_ownership_unavailable');}
}
async function privateBytes(file:string,max:number){
 absolute.parse(file);const info=await lstat(file),parent=dirname(file);if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>max||!canonicalPathEqual((await realpath(parent)),parent))throw Error('invalid_private_file');
 const bytes=await readFile(file);if(bytes.length<1||bytes.length>max)throw Error('invalid_private_file');return bytes;
}
function caBundle(bytes:Buffer){const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),certs=text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);if(!certs?.length||certs.length>8||text.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,'').trim())throw Error('invalid_ca');for(const cert of certs)new X509Certificate(cert);return text;}
export async function connectNativeRuntime(descriptorFile:string,expectedMigrations:SchemaInventory,expectedDescriptorSha256?:string){
 let q:z.infer<typeof nativeRuntimeDescriptorSchema>,password:string,ssl:pg.PoolConfig['ssl'],descriptorSha256:string;
 try{
  if(expectedDescriptorSha256!==undefined&&!/^[a-f0-9]{64}$/.test(expectedDescriptorSha256))throw Error('invalid_descriptor_binding');
  const descriptorBytes=await privateBytes(descriptorFile,16384);descriptorSha256=createHash('sha256').update(descriptorBytes).digest('hex');if(expectedDescriptorSha256!==undefined&&expectedDescriptorSha256!==descriptorSha256)throw Error('descriptor_changed');
  q=nativeRuntimeDescriptorSchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(descriptorBytes)));
  password=new TextDecoder('utf-8',{fatal:true}).decode(await privateBytes(q.passwordFile,512));if(!password||/[\x00-\x1f\x7f]/.test(password))throw Error('invalid_password_file');
  ssl=q.tls.mode==='verify-full'?{rejectUnauthorized:true,minVersion:'TLSv1.2',ca:caBundle(await privateBytes(q.tls.caFile,65536))}:false;
 }catch{throw Error('native_runtime_configuration_invalid');}
 if(Object.entries(process.env).some(([key,value])=>/^PG/i.test(key)&&value))throw Error('native_runtime_environment_conflict');
 const runtimeId=randomUUID(),poolOptions:pg.PoolConfig&{sslnegotiation:'postgres'}={host:q.host,port:q.port,database:q.database,user:q.runtimeRole,password,ssl,sslnegotiation:'postgres',max:5,idleTimeoutMillis:10000,connectionTimeoutMillis:3000,application_name:'eb-runtime:'+runtimeId,client_encoding:'UTF8',statement_timeout:10000,lock_timeout:3000,idle_in_transaction_session_timeout:15000,options:'-c search_path=pg_catalog,public -c row_security=on -c app.enterprise_id='+q.enterpriseId};
 const state:ConnectionState={enterpriseId:q.enterpriseId,runtimeRole:q.runtimeRole,mode:q.tls.mode,descriptorSha256,runtimeId,options:poolOptions,used:false};
 const pool=new pg.Pool(poolOptions);
 let closing:Promise<void>|undefined;
 const db:Database=Object.freeze({profile:'postgres' as const,query:async(s:string,p?:unknown[])=>({rows:(await pool.query(s,p)).rows}),exec:(s:string)=>pool.query(s),transaction:async<T>(fn:(tx:import('./adapter.ts').Sql)=>Promise<T>)=>{const client=await pool.connect();try{await client.query('BEGIN');const value=await fn({query:async(s,p)=>({rows:(await client.query(s,p)).rows}),exec:s=>client.query(s)});await client.query('COMMIT');return value;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}},close:()=>closing??=(async()=>{verifiedConnections.delete(db);await state.owner?.release();await pool.end();})()});
 // Idle connection failures must not become unhandled EventEmitter errors.
 // 空闲连接失败不能成为未处理的EventEmitter错误。
 pool.on('error',()=>{});
 try{
  const qualification=await inspectNativeRuntime(db,{enterpriseId:q.enterpriseId,runtimeRole:q.runtimeRole,expectedMigrations});
  if(!qualification.prerequisitesMet)throw Error('native_runtime_prerequisites_failed');verifiedConnections.set(db,state);return {database:db,qualification};
 }catch{await db.close().catch(()=>{});throw Error('native_runtime_connection_refused');}
}
