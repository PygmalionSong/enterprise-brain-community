// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Identity is server-derived; no caller-supplied role switch. / 身份由服务端确定，调用者不可自选角色。
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hash, compare } from 'bcryptjs';
import type { Database } from '../db/adapter.ts';
import {validPassword,validUsername} from './credentials.ts';
export const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export type Actor = { id: string; enterpriseId: string; role: string; authorizationVersion: number };
export class IdentityService {
  private db: Database;
  private now: () => Date;
  constructor(db: Database, now = () => new Date()) { this.db=db; this.now=now; }
  async issueBootstrap(enterpriseId: string) {
    const token = randomBytes(32).toString('base64url');
    await this.db.query('INSERT INTO bootstrap_grant(token_hash,enterprise_id,expires_at) VALUES($1,$2,$3)',[digest(token),enterpriseId,new Date(this.now().getTime()+20*60_000)]);
    return token;
  }
  async consumeBootstrap(token: string, username: string, password: string) {
    if (!validUsername(username)||!validPassword(password)) throw new Error('invalid_credentials');
    const passwordHash = await hash(password,12);
    return this.db.transaction(async tx => {
      const grant = await tx.query('UPDATE bootstrap_grant SET consumed_at=$2 WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>$2 RETURNING enterprise_id',[digest(token),this.now()]);
      if (!grant.rows.length) throw new Error('bootstrap_invalid');
      const id = randomUUID();
      await tx.query("INSERT INTO principal(id,enterprise_id,username,password_hash,role) VALUES($1,$2,$3,$4,'it')",[id,grant.rows[0].enterprise_id,username,passwordHash]);
      return id;
    });
  }
  async login(enterpriseId: string, username: string, password: string) {
    if(!validUsername(username)||!validPassword(password))throw new Error('invalid_credentials');
    const p = await this.db.query('SELECT id,password_hash,disabled,authorization_version FROM principal WHERE enterprise_id=$1 AND username=$2',[enterpriseId,username]);
    if (!p.rows.length || p.rows[0].disabled || !p.rows[0].password_hash || !(await compare(password,String(p.rows[0].password_hash)))) throw new Error('invalid_credentials');
    return this.createSession(String(p.rows[0].id),{authorizationVersion:Number(p.rows[0].authorization_version),passwordHash:String(p.rows[0].password_hash)});
  }
  async createSession(principalId: string,expected?:{authorizationVersion:number;passwordHash:string}) {
    return this.db.transaction(async tx=>{
    const principal = await tx.query('SELECT authorization_version,disabled,password_hash FROM principal WHERE id=$1 FOR SHARE',[principalId]);
    if (!principal.rows.length || principal.rows[0].disabled) throw new Error('not_authorized');
    // A password reset during bcrypt verification must not mint a fresh-version session.
    // bcrypt校验期间改密，旧密码不得获得新版本会话。
    if(expected&&(Number(principal.rows[0].authorization_version)!==expected.authorizationVersion||principal.rows[0].password_hash!==expected.passwordHash))throw new Error('invalid_credentials');
    const token = randomBytes(32).toString('base64url'), csrf = randomBytes(32).toString('base64url'), now=this.now();
    await tx.query('INSERT INTO auth_session(token_hash,principal_id,authorization_version,csrf_hash,created_at,last_seen_at,expires_at) VALUES($1,$2,$3,$4,$5,$5,$6)',[digest(token),principalId,principal.rows[0].authorization_version,digest(csrf),now,new Date(now.getTime()+12*3600_000)]);
    return {token,csrf};
    });
  }
  async authenticate(token: string): Promise<Actor | null> {
    const now=this.now(), idleCutoff=new Date(now.getTime()-30*60_000);
    const q=await this.db.query(`SELECT p.id,p.enterprise_id,p.role,p.authorization_version FROM auth_session s JOIN principal p ON p.id=s.principal_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND NOT p.disabled AND s.authorization_version=p.authorization_version AND s.expires_at>$2 AND s.last_seen_at>$3`,[digest(token),now,idleCutoff]);
    if(!q.rows.length)return null;
    await this.db.query('UPDATE auth_session SET last_seen_at=$2 WHERE token_hash=$1',[digest(token),now]);
    const p=q.rows[0];return {id:String(p.id),enterpriseId:String(p.enterprise_id),role:String(p.role),authorizationVersion:Number(p.authorization_version)};
  }
  async validateCsrf(token:string,csrf:string,origin:string,expectedOrigin:string) {
    if(origin!==expectedOrigin || !await this.authenticate(token))return false;
    const q=await this.db.query('SELECT token_hash FROM auth_session WHERE token_hash=$1 AND csrf_hash=$2',[digest(token),digest(csrf)]);return q.rows.length===1;
  }
  async revoke(principalId:string) {
    await this.db.query('UPDATE principal SET authorization_version=authorization_version+1 WHERE id=$1',[principalId]);
  }
  async logoutSession(token:string){await this.db.query('UPDATE auth_session SET revoked_at=$2 WHERE token_hash=$1 AND revoked_at IS NULL',[digest(token),this.now()]);}
  async csrfForSession(token:string){
    if(!await this.authenticate(token))throw new Error('not_authorized');
    const csrf=randomBytes(32).toString('base64url');
    await this.db.query('UPDATE auth_session SET csrf_hash=$2 WHERE token_hash=$1',[digest(token),digest(csrf)]);return csrf;
  }
}
