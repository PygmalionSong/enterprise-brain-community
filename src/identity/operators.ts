// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Trusted identity control; ordinary IT membership cannot grant business roles.
// 受信身份控制；普通IT身份不能授予业务角色。
import {randomUUID} from 'node:crypto';
import {hash as passwordHash} from 'bcryptjs';
import {z} from 'zod';
import type {Database,Sql} from '../db/adapter.ts';
import {digest,type Actor} from './service.ts';
import {validPassword,validUsername} from './credentials.ts';

type Row=Record<string,any>;
const role=z.enum(['it','executive','operations','auditor']);
const username=z.string().refine(validUsername,'invalid_username');
const password=z.string().refine(validPassword,'invalid_password');
const createInput=z.object({username,password,role,identityAdministrator:z.boolean().default(false)}).strict();
const changes=z.object({role:role.optional(),disabled:z.boolean().optional(),identityAdministrator:z.boolean().optional()}).strict().refine(v=>Object.keys(v).length>0,'empty_change');
const roles=['it','executive','operations','auditor'];

export class OperatorDirectory {
 private db:Database;private now:()=>Date;
 constructor(db:Database,now=()=>new Date()){this.db=db;this.now=now;}
 private view(p:Row){return {id:String(p.id),username:String(p.username),role:String(p.role),disabled:Boolean(p.disabled),authorizationVersion:Number(p.authorization_version),identityAdministrator:Boolean(p.identity_administrator)};}
 private async audit(tx:Sql,enterprise:string,actor:string,kind:string,target:string,details:unknown={}){
  await tx.query('INSERT INTO audit_event(enterprise_id,id,kind,actor_id,details) VALUES($1,$2,$3,$4,$5)',[enterprise,randomUUID(),kind,actor,JSON.stringify({target,...details as object})]);
 }
 private async tx<T>(actor:Actor,targets:string[],fn:(tx:Sql)=>Promise<T>):Promise<T>{
  return this.db.transaction(async tx=>{
   // Match graph/runtime principal-before-enterprise lock ordering.
   // 与图运行保持先身份后企业的锁顺序。
   const rows=new Map<string,Row>();for(const id of [...new Set([actor.id,...targets])].sort()){
    z.uuid().parse(id);const p=(await tx.query<Row>('SELECT * FROM principal WHERE enterprise_id=$1 AND id=$2 FOR UPDATE',[actor.enterpriseId,id])).rows[0];if(p)rows.set(id,p);
   }
   const p=rows.get(actor.id);if(!p||p.disabled||p.role!=='it'||actor.role!=='it'||Number(p.authorization_version)!==actor.authorizationVersion)throw Error('not_authorized');
   const e=(await tx.query<Row>('SELECT environment FROM enterprise WHERE id=$1 FOR UPDATE',[actor.enterpriseId])).rows[0];if(e?.environment!=='enterprise')throw Error('operator_enterprise_required');
   const grant=(await tx.query<Row>('SELECT enabled FROM identity_administrator WHERE enterprise_id=$1 AND principal_id=$2',[actor.enterpriseId,actor.id])).rows[0];if(!grant?.enabled)throw Error('not_authorized');
   return fn(tx);
  });
 }
 private async target(tx:Sql,actor:Actor,id:string){
  const p=(await tx.query<Row>('SELECT p.*,COALESCE(a.enabled,false) identity_administrator FROM principal p LEFT JOIN identity_administrator a ON a.enterprise_id=p.enterprise_id AND a.principal_id=p.id WHERE p.enterprise_id=$1 AND p.id=$2',[actor.enterpriseId,id])).rows[0];if(!p)throw Error('not_found');return p;
 }
 private async invalidate(tx:Sql,id:string){
  await tx.query('UPDATE principal SET authorization_version=authorization_version+1 WHERE id=$1',[id]);
  await tx.query('UPDATE auth_session SET revoked_at=$2 WHERE principal_id=$1 AND revoked_at IS NULL',[id,this.now()]);
 }
 async initialize(token:string,input:unknown){
  const q=z.object({username,password}).strict().parse(input);if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error('bootstrap_invalid');
  const encoded=await passwordHash(q.password,12);
  return this.db.transaction(async tx=>{
   const initial=(await tx.query<Row>('SELECT enterprise_id FROM bootstrap_grant WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>$2',[digest(token),this.now()])).rows[0];if(!initial)throw Error('bootstrap_invalid');
   const e=(await tx.query<Row>('SELECT environment FROM enterprise WHERE id=$1 FOR UPDATE',[initial.enterprise_id])).rows[0];if(e?.environment!=='enterprise')throw Error('operator_enterprise_required');
   const g=(await tx.query<Row>('SELECT enterprise_id FROM bootstrap_grant WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>$2 FOR UPDATE',[digest(token),this.now()])).rows[0];if(!g)throw Error('bootstrap_invalid');
   if(Number((await tx.query<Row>('SELECT count(*) n FROM principal WHERE enterprise_id=$1',[g.enterprise_id])).rows[0].n)!==0)throw Error('operator_already_initialized');
   const id=randomUUID();await tx.query("INSERT INTO principal(id,enterprise_id,username,password_hash,role) VALUES($1,$2,$3,$4,'it')",[id,g.enterprise_id,q.username,encoded]);
   await tx.query('INSERT INTO identity_administrator(enterprise_id,principal_id) VALUES($1,$2)',[g.enterprise_id,id]);
   await tx.query('UPDATE bootstrap_grant SET consumed_at=$2 WHERE enterprise_id=$1 AND consumed_at IS NULL',[g.enterprise_id,this.now()]);
   await this.audit(tx,g.enterprise_id,id,'operator_initialized',id);
   return {id,enterpriseId:String(g.enterprise_id),username:q.username,role:'it',authorizationVersion:1,disabled:false,identityAdministrator:true};
  });
 }
 async list(actor:Actor){return this.tx(actor,[],async tx=>(await tx.query<Row>('SELECT p.id,p.username,p.role,p.disabled,p.authorization_version,COALESCE(a.enabled,false) identity_administrator FROM principal p LEFT JOIN identity_administrator a ON a.enterprise_id=p.enterprise_id AND a.principal_id=p.id WHERE p.enterprise_id=$1 ORDER BY p.username LIMIT 200',[actor.enterpriseId])).rows.map(p=>this.view(p)));}
 async create(actor:Actor,input:unknown){
  await this.tx(actor,[],async()=>{});const q=createInput.parse(input);if(q.identityAdministrator&&q.role!=='it')throw Error('operator_admin_role_required');const encoded=await passwordHash(q.password,12);
  return this.tx(actor,[],async tx=>{
   if(Number((await tx.query<Row>('SELECT count(*) n FROM principal WHERE enterprise_id=$1',[actor.enterpriseId])).rows[0].n)>=200)throw Error('operator_capacity');
   if((await tx.query('SELECT id FROM principal WHERE enterprise_id=$1 AND username=$2',[actor.enterpriseId,q.username])).rows.length)throw Error('operator_username_conflict');
   const id=randomUUID();await tx.query('INSERT INTO principal(id,enterprise_id,username,password_hash,role) VALUES($1,$2,$3,$4,$5)',[id,actor.enterpriseId,q.username,encoded,q.role]);
   if(q.identityAdministrator)await tx.query('INSERT INTO identity_administrator(enterprise_id,principal_id) VALUES($1,$2)',[actor.enterpriseId,id]);
   await this.audit(tx,actor.enterpriseId,actor.id,'operator_created',id,{role:q.role,identityAdministrator:q.identityAdministrator});return this.view(await this.target(tx,actor,id));
  });
 }
 async change(actor:Actor,id:string,expectedVersion:number,input:unknown){
  z.number().int().positive().parse(expectedVersion);const q=changes.parse(input);
  return this.tx(actor,[id],async tx=>{
   const p=await this.target(tx,actor,id);if(Number(p.authorization_version)!==expectedVersion)throw Error('operator_conflict');const next={role:q.role??p.role,disabled:q.disabled??p.disabled,identityAdministrator:q.identityAdministrator??p.identity_administrator};
   if(!roles.includes(next.role)||next.identityAdministrator&&next.role!=='it')throw Error('operator_admin_role_required');
   if(p.identity_administrator&&!p.disabled&&(!next.identityAdministrator||next.disabled||next.role!=='it')){
    const count=Number((await tx.query<Row>("SELECT count(*) n FROM identity_administrator a JOIN principal p ON p.enterprise_id=a.enterprise_id AND p.id=a.principal_id WHERE a.enterprise_id=$1 AND a.enabled AND NOT p.disabled AND p.role='it'",[actor.enterpriseId])).rows[0].n);if(count<=1)throw Error('operator_last_administrator');
   }
   if(next.role===p.role&&next.disabled===p.disabled&&next.identityAdministrator===p.identity_administrator)return this.view(p);
   await tx.query('UPDATE principal SET role=$2,disabled=$3 WHERE id=$1',[id,next.role,next.disabled]);
   await tx.query('INSERT INTO identity_administrator(enterprise_id,principal_id,enabled) VALUES($1,$2,$3) ON CONFLICT(enterprise_id,principal_id) DO UPDATE SET enabled=$3',[actor.enterpriseId,id,next.identityAdministrator]);
   await this.invalidate(tx,id);await this.audit(tx,actor.enterpriseId,actor.id,'operator_changed',id,{previousVersion:expectedVersion,...next});return this.view(await this.target(tx,actor,id));
  });
 }
 async resetPassword(actor:Actor,id:string,expectedVersion:number,newPassword:unknown){
  z.number().int().positive().parse(expectedVersion);await this.tx(actor,[id],async()=>{});const encoded=await passwordHash(password.parse(newPassword),12);
  return this.tx(actor,[id],async tx=>{const p=await this.target(tx,actor,id);if(Number(p.authorization_version)!==expectedVersion)throw Error('operator_conflict');await tx.query('UPDATE principal SET password_hash=$2 WHERE id=$1',[id,encoded]);await this.invalidate(tx,id);await this.audit(tx,actor.enterpriseId,actor.id,'operator_password_reset',id,{previousVersion:expectedVersion});return this.view(await this.target(tx,actor,id));});
 }
 async revokeSessions(actor:Actor,id:string,expectedVersion:number){
  z.number().int().positive().parse(expectedVersion);return this.tx(actor,[id],async tx=>{const p=await this.target(tx,actor,id);if(Number(p.authorization_version)!==expectedVersion)throw Error('operator_conflict');await this.invalidate(tx,id);await this.audit(tx,actor.enterpriseId,actor.id,'operator_sessions_revoked',id,{previousVersion:expectedVersion});return this.view(await this.target(tx,actor,id));});
 }
}
