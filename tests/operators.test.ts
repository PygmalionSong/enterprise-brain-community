// Isolated enterprise identity state, without demo seed or public listeners.
// 独立企业身份状态，不加载演示种子或公开监听。
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {openDatabase,withEnterprise} from '../src/db/adapter.ts';
import {migrate} from '../src/db/migrate.ts';
import {IdentityService,type Actor} from '../src/identity/service.ts';
import {OperatorDirectory} from '../src/identity/operators.ts';
const password='Synthetic-Operator-Password-2026';
async function fixture(location=':memory:'){
 const db=await openDatabase(location);await migrate(db,'migrations');const enterpriseId=randomUUID();await db.query("INSERT INTO enterprise VALUES($1,'Owned identity fixture','enterprise','CNY','Asia/Shanghai')",[enterpriseId]);
 let now=new Date('2026-10-15T00:00:00Z');const clock=()=>now,identity=new IdentityService(db,clock),directory=new OperatorDirectory(db,clock),grant=await identity.issueBootstrap(enterpriseId),created=await directory.initialize(grant,{username:'root-admin',password}),actor:Actor={id:created.id,enterpriseId,role:'it',authorizationVersion:1};
 return {db,enterpriseId,identity,directory,actor,grant,clock,advance:(ms:number)=>now=new Date(now.getTime()+ms)};
}
test('operators: first administrator is atomic, one-use and separate from connector IT',async()=>{const f=await fixture();try{
 await assert.rejects(f.directory.initialize(f.grant,{username:'another-admin',password}),/bootstrap_invalid/);const it=await f.directory.create(f.actor,{username:'connector-admin',password,role:'it'}),session=await f.identity.login(f.enterpriseId,it.username,password),actor=(await f.identity.authenticate(session.token))!;
 await assert.rejects(f.directory.list(actor),/not_authorized/);await assert.rejects(f.directory.create(actor,{username:'fake-executive',password,role:'executive'}),/not_authorized/);assert.equal((await f.directory.list(f.actor)).length,2);assert.equal((await f.db.query('SELECT * FROM source_record')).rows.length,0);
}finally{await f.db.close();}});
test('operators: initialization races create one administrator and invalidate every unused grant',async()=>{const db=await openDatabase(':memory:');try{
 await migrate(db,'migrations');const e=randomUUID();await db.query("INSERT INTO enterprise VALUES($1,'Race','enterprise','CNY','UTC')",[e]);const i=new IdentityService(db),d=new OperatorDirectory(db),grants=await Promise.all([i.issueBootstrap(e),i.issueBootstrap(e)]),results=await Promise.allSettled(grants.map((g,n)=>d.initialize(g,{username:'admin-'+n,password})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.query('SELECT * FROM principal')).rows.length,1);assert.equal((await db.query('SELECT * FROM bootstrap_grant WHERE consumed_at IS NULL')).rows.length,0);
}finally{await db.close();}});
test('operators: demo mode and expired bootstrap cannot initialize an enterprise operator directory',async()=>{const f=await fixture();try{
 const e=randomUUID();await f.db.query("INSERT INTO enterprise VALUES($1,'Demo','demo','CNY','UTC')",[e]);const demo=await f.identity.issueBootstrap(e);await assert.rejects(f.directory.initialize(demo,{username:'demo-admin',password}),/operator_enterprise_required/);
 const e2=randomUUID();await f.db.query("INSERT INTO enterprise VALUES($1,'Expired','enterprise','CNY','UTC')",[e2]);const grant=await f.identity.issueBootstrap(e2);f.advance(20*60_000);await assert.rejects(f.directory.initialize(grant,{username:'expired-admin',password}),/bootstrap_invalid/);
}finally{await f.db.close();}});
test('operators: role and administrator changes invalidate existing sessions and stale versions',async()=>{const f=await fixture();try{
 const user=await f.directory.create(f.actor,{username:'business-user',password,role:'operations'}),s=await f.identity.login(f.enterpriseId,user.username,password);const changed=await f.directory.change(f.actor,user.id,1,{role:'auditor'});assert.equal(changed.authorizationVersion,2);assert.equal(await f.identity.authenticate(s.token),null);await assert.rejects(f.directory.change(f.actor,user.id,1,{disabled:true}),/operator_conflict/);
 const second=await f.directory.create(f.actor,{username:'second-admin',password,role:'it',identityAdministrator:true}),s2=await f.identity.login(f.enterpriseId,second.username,password),secondActor=(await f.identity.authenticate(s2.token))!;await f.directory.change(f.actor,second.id,1,{identityAdministrator:false});await assert.rejects(f.directory.list(secondActor),/not_authorized/);assert.equal(await f.identity.authenticate(s2.token),null);
}finally{await f.db.close();}});
test('operators: the last active identity administrator cannot be removed, disabled or demoted',async()=>{const f=await fixture();try{
 for(const input of [{disabled:true},{identityAdministrator:false},{role:'executive',identityAdministrator:false}])await assert.rejects(f.directory.change(f.actor,f.actor.id,1,input),/operator_last_administrator/);
 const other=await f.directory.create(f.actor,{username:'backup-admin',password,role:'it',identityAdministrator:true});await f.directory.change(f.actor,f.actor.id,1,{disabled:true});const s=await f.identity.login(f.enterpriseId,other.username,password),actor=(await f.identity.authenticate(s.token))!;assert.equal((await f.directory.list(actor)).filter(p=>p.identityAdministrator&&!p.disabled).length,1);await assert.rejects(f.directory.list(f.actor),/not_authorized/);
}finally{await f.db.close();}});
test('operators: password reset and explicit revocation never reactivate old sessions',async()=>{const f=await fixture();try{
 const user=await f.directory.create(f.actor,{username:'reset-user',password,role:'executive'}),s=await f.identity.login(f.enterpriseId,user.username,password),nextPassword='Different-Synthetic-Password-2026',reset=await f.directory.resetPassword(f.actor,user.id,1,nextPassword);assert.equal(reset.authorizationVersion,2);assert.equal(await f.identity.authenticate(s.token),null);await assert.rejects(f.identity.login(f.enterpriseId,user.username,password),/invalid_credentials/);
 const newer=await f.identity.login(f.enterpriseId,user.username,nextPassword);await f.directory.revokeSessions(f.actor,user.id,2);assert.equal(await f.identity.authenticate(newer.token),null);assert.equal(await f.identity.authenticate(s.token),null);
}finally{await f.db.close();}});
test('operators: UTF-8 overflow, NUL and malformed Unicode cannot exploit bcrypt truncation',async()=>{const f=await fixture();try{
 const limit='中'.repeat(24),user=await f.directory.create(f.actor,{username:'unicode-user',password:limit,role:'auditor'});assert.ok(await f.identity.login(f.enterpriseId,user.username,limit));for(const invalid of [limit+'x','😀'.repeat(19),'Valid-Password-2026\0suffix','Valid-Password-2026\uD800','short']){await assert.rejects(f.identity.login(f.enterpriseId,user.username,invalid),/invalid_credentials/);await assert.rejects(f.directory.resetPassword(f.actor,user.id,1,invalid));}assert.equal((await f.directory.list(f.actor)).find(u=>u.id===user.id)!.authorizationVersion,1);
 const e=randomUUID();await f.db.query("INSERT INTO enterprise VALUES($1,'Overflow','enterprise','CNY','UTC')",[e]);const token=await f.identity.issueBootstrap(e);await assert.rejects(f.identity.consumeBootstrap(token,'overflow-user',limit+'x'),/invalid_credentials/);assert.ok(await f.identity.consumeBootstrap(token,'bounded-user',limit));
}finally{await f.db.close();}});
test('operators: disabled users cannot log in and re-enable requires a new session',async()=>{const f=await fixture();try{
 const u=await f.directory.create(f.actor,{username:'disabled-user',password,role:'operations'}),s=await f.identity.login(f.enterpriseId,u.username,password);await f.directory.change(f.actor,u.id,1,{disabled:true});await assert.rejects(f.identity.login(f.enterpriseId,u.username,password),/invalid_credentials/);await f.directory.change(f.actor,u.id,2,{disabled:false});assert.equal(await f.identity.authenticate(s.token),null);assert.ok(await f.identity.login(f.enterpriseId,u.username,password));
}finally{await f.db.close();}});
test('operators: tenant boundaries, spoofed roles, private-table access and audit redaction hold',async()=>{const f=await fixture(),other=await fixture();try{
 await assert.rejects(f.directory.list({...f.actor,role:'executive'}),/not_authorized/);await assert.rejects(f.directory.change(f.actor,other.actor.id,1,{disabled:true}),/not_found/);await assert.rejects(f.directory.create(f.actor,{username:'bad-admin',password,role:'executive',identityAdministrator:true}),/operator_admin_role_required/);await assert.rejects(f.directory.create(f.actor,{username:'root-admin',password,role:'it'}),/operator_username_conflict/);
 await assert.rejects(withEnterprise(f.db,f.enterpriseId,tx=>tx.query('SELECT * FROM identity_administrator')),/permission denied/);const serialized=JSON.stringify({list:await f.directory.list(f.actor),audit:(await f.db.query('SELECT details FROM audit_event')).rows});assert.equal(serialized.includes(password),false);assert.equal(serialized.includes('password_hash'),false);assert.equal(serialized.includes(f.grant),false);
}finally{await f.db.close();await other.db.close();}});
test('operators: two admin removals serialize and leave one active administrator',async()=>{const f=await fixture();try{
 const second=await f.directory.create(f.actor,{username:'competing-admin',password,role:'it',identityAdministrator:true}),s=await f.identity.login(f.enterpriseId,second.username,password),other=(await f.identity.authenticate(s.token))!,results=await Promise.allSettled([f.directory.change(f.actor,second.id,1,{disabled:true}),f.directory.change(other,f.actor.id,1,{disabled:true})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await f.db.query('SELECT * FROM identity_administrator a JOIN principal p ON p.id=a.principal_id WHERE a.enabled AND NOT p.disabled')).rows.length,1);
}finally{await f.db.close();}});
test('operators: identity grants, revoked sessions and password changes survive SQL reopening',async()=>{const dir=await mkdtemp(resolve('.evidence/operators-reopen-')),f=await fixture(join(dir,'database'));let db:Awaited<ReturnType<typeof openDatabase>>|undefined;try{
 const u=await f.directory.create(f.actor,{username:'persistent-user',password,role:'auditor'}),session=await f.identity.login(f.enterpriseId,u.username,password);await f.directory.resetPassword(f.actor,u.id,1,'Updated-Persistent-Password-2026');await f.db.close();db=await openDatabase(join(dir,'database'));const d=new OperatorDirectory(db),identity=new IdentityService(db,f.clock);assert.equal((await d.list(f.actor)).length,2);assert.equal(await identity.authenticate(session.token),null);assert.ok(await identity.login(f.enterpriseId,u.username,'Updated-Persistent-Password-2026'));
}finally{await db?.close();await rm(dir,{recursive:true,force:true});}});
test('operators: password reset between credential lookup and session creation invalidates the login',async()=>{const f=await fixture();try{
 const u=await f.directory.create(f.actor,{username:'racing-user',password,role:'auditor'});let changed=false;const identity=new IdentityService({...f.db,query:async<T extends Record<string,unknown>>(sql:string,params?:unknown[])=>{const result=await f.db.query<T>(sql,params);if(sql.startsWith('SELECT id,password_hash')&&!changed){changed=true;await f.directory.resetPassword(f.actor,u.id,1,'Reset-During-Verification-2026');}return result;}},f.clock);
 await assert.rejects(identity.login(f.enterpriseId,u.username,password),/invalid_credentials/);assert.equal((await f.db.query('SELECT * FROM auth_session WHERE principal_id=$1',[u.id])).rows.length,0);assert.ok(await f.identity.login(f.enterpriseId,u.username,'Reset-During-Verification-2026'));
}finally{await f.db.close();}});
