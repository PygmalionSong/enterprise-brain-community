// Confirmation is a live capability boundary, not a UI-only checkbox.
// 确认是实际能力边界，不是仅前端复选框。
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db/adapter.ts';
import {migrate} from '../src/db/migrate.ts';
import {ConnectionService} from '../src/connectors/discovery.ts';
import {initializeCrmFixture,SqlCrmFixtureDriver} from '../src/connectors/crm-source.ts';
import {createApplication} from '../src/http/server.ts';
async function fixture(location=':memory:'){
 const db=await openDatabase(location),source=await openDatabase(':memory:'),enterpriseId=randomUUID(),id=randomUUID();await migrate(db,'migrations');await initializeCrmFixture(source,enterpriseId);await db.query("INSERT INTO enterprise VALUES($1,'Onboarding','demo','CNY','Asia/Shanghai')",[enterpriseId]);await db.query("INSERT INTO principal(id,enterprise_id,username,role) VALUES($1,$2,'onboarding-it','it')",[id,enterpriseId]);const actor={id,enterpriseId,role:'it',authorizationVersion:1},driver=new SqlCrmFixtureDriver(source,{enterpriseId}),service=new ConnectionService(db,[driver]),{grantId}=await service.grant(actor,{kind:'endpoint',allowlist:[driver.target],expiresAt:new Date(Date.now()+600000).toISOString(),rateLimit:120}),request=await service.request(actor,'CON-02',grantId),diagnosed=await service.diagnose(actor,'CON-02',request.version);
 const input={systemName:'Owned CRM',businessPurpose:'Customer/order associations; not recognized revenue',businessOwnerRole:'Customer operations',mapping:diagnosed.mapping,readAcknowledged:true,processAcknowledged:true,allowWrite:false,sandboxWriteAcknowledged:false};
 return {db,source,enterpriseId,actor,driver,service,grantId,diagnosed,input,async activate(){const c=await service.confirm(actor,'CON-02',diagnosed.version,input);return service.test(actor,'CON-02',c.version);},async close(){await source.close();await db.close();}};
}
test('onboarding: discovery has no business-page read; confirmation precedes tests and is bound to the mapping',async()=>{const f=await fixture();try{
 let reads=0,sandboxes=0;const read=f.driver.readPage.bind(f.driver);f.driver.readPage=async(...args)=>{reads++;return read(...args);};f.driver.testSandbox=async()=>{sandboxes++;throw Error('must_not_run');};
 await assert.rejects(f.service.test(f.actor,'CON-02',f.diagnosed.version),/confirmation_required/);await assert.rejects(f.service.readPage(f.actor,'CON-02'),/connector_not_active/);assert.equal(reads,0);
 const c=await f.service.confirm(f.actor,'CON-02',f.diagnosed.version,f.input);assert.equal(reads,0);assert.equal(c.confirmation.scope.enterpriseId,f.enterpriseId);assert.equal(c.confirmation.scope.kind,'entire_registered_source');assert.equal(c.confirmation.confirmedBy,f.actor.id);assert.equal(c.confirmation.mode,'operator');
 await assert.rejects(f.service.test(f.actor,'CON-02',c.version,{...f.input.mapping,currency:'USD'}),/confirmation_required/);assert.equal(reads,0);const active=await f.service.test(f.actor,'CON-02',c.version);assert.equal(active.read_enabled,true);assert.equal(active.write_enabled,false);assert.ok(reads>0);assert.equal(sandboxes,0);
 const history=await f.service.revisions(f.actor,'CON-02');assert.ok(history.some(r=>r.snapshot.confirmation?.confirmedBy===f.actor.id));
 }finally{await f.close();}});
test('onboarding: stale, invented filtering, write elevation and role spoofing cannot create confirmation',async()=>{const f=await fixture();try{
 await assert.rejects(f.service.confirm(f.actor,'CON-02',f.diagnosed.version-1,f.input),/version_conflict/);await assert.rejects(f.service.confirm(f.actor,'CON-02',f.diagnosed.version,{...f.input,rowFilter:'customer=MEM-001'}));await assert.rejects(f.service.confirm(f.actor,'CON-02',f.diagnosed.version,{...f.input,readAcknowledged:false}));await assert.rejects(f.service.confirm(f.actor,'CON-02',f.diagnosed.version,{...f.input,allowWrite:true,sandboxWriteAcknowledged:true}),/unsupported/);await assert.rejects(f.service.confirm({...f.actor,role:'executive'},'CON-02',f.diagnosed.version,f.input),/not_authorized/);assert.equal((await f.service.list(f.actor))[0].confirmation,null);
 }finally{await f.close();}});
test('onboarding: request and metadata drift invalidate old confirmation, including legacy active rows',async()=>{const f=await fixture();try{
 await f.activate();await f.source.exec('ALTER VIEW crm_fixture_read RENAME COLUMN segment TO changed_segment');await assert.rejects(f.service.assertActive(f.enterpriseId,'CON-02','read'),/connector_not_active/);let row=(await f.service.list(f.actor))[0];assert.equal(row.state,'degraded');assert.equal(row.confirmation,null);
 await f.service.request(f.actor,'CON-02',f.grantId);row=(await f.service.list(f.actor))[0];assert.equal(row.confirmation,null);await f.db.query("UPDATE connector_connection SET state='active',read_enabled=true,confirmation=NULL WHERE enterprise_id=$1",[f.enterpriseId]);await assert.rejects(f.service.assertActive(f.enterpriseId,'CON-02','read'),/connector_not_active/);assert.equal((await f.service.list(f.actor))[0].state,'degraded');
 }finally{await f.close();}});
test('onboarding: revoking the confirmer invalidates reading even when grant issuer remains authorized',async()=>{const f=await fixture();try{
 const id=randomUUID();await f.db.query("INSERT INTO principal(id,enterprise_id,username,role) VALUES($1,$2,'reviewer','it')",[id,f.enterpriseId]);const reviewer={...f.actor,id};const c=await f.service.confirm(reviewer,'CON-02',f.diagnosed.version,f.input);await f.service.test(f.actor,'CON-02',c.version);await f.db.query('UPDATE principal SET authorization_version=2 WHERE id=$1',[id]);await assert.rejects(f.service.readPage(f.actor,'CON-02'),/connector_not_active/);assert.equal((await f.service.list(f.actor))[0].confirmation,null);
 }finally{await f.close();}});
test('onboarding: revocation during a read withholds returned data',async()=>{const f=await fixture();try{
 await f.activate();const read=f.driver.readPage.bind(f.driver);f.driver.readPage=async(...args)=>{const page=await read(...args);await f.service.revoke(f.actor,f.grantId);return page;};await assert.rejects(f.service.readPage(f.actor,'CON-02'),/needs_authorization|version_conflict/);assert.equal((await f.service.list(f.actor))[0].read_enabled,false);
 }finally{await f.close();}});
test('onboarding: a concurrent new request is not overwritten by the earlier validation failure',async()=>{const f=await fixture();try{
 const c=await f.service.confirm(f.actor,'CON-02',f.diagnosed.version,f.input);let called=false;const read=f.driver.readPage.bind(f.driver);f.driver.readPage=async(...args)=>{if(!called){called=true;await f.service.request(f.actor,'CON-02',f.grantId);}return read(...args);};await assert.rejects(f.service.test(f.actor,'CON-02',c.version),/version_conflict/);const row=(await f.service.list(f.actor))[0];assert.equal(row.state,'requested');assert.equal(row.confirmation,null);assert.equal(row.read_enabled,false);
 }finally{await f.close();}});
test('onboarding: explicit confirmation and revocation survive database reopening without reapproval',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'eb-onboarding-')),f=await fixture(join(directory,'db'));let reopened:Awaited<ReturnType<typeof openDatabase>>|undefined;
 try{const active=await f.activate();await f.db.close();reopened=await openDatabase(join(directory,'db'));await migrate(reopened,'migrations');const service=new ConnectionService(reopened,[f.driver]);assert.deepEqual((await service.list(f.actor))[0].confirmation,active.confirmation);await service.readPage(f.actor,'CON-02');await service.revoke(f.actor,f.grantId);await reopened.close();reopened=await openDatabase(join(directory,'db'));const after=new ConnectionService(reopened,[f.driver]);await assert.rejects(after.readPage(f.actor,'CON-02'),/connector_not_active/);assert.equal((await after.list(f.actor))[0].confirmation,null);
 }finally{await reopened?.close();await f.source.close();await rm(directory,{recursive:true,force:true});}
});
test('onboarding HTTP: confirmation is CSRF protected, strict and separate from the executive role',async()=>{const f=await fixture(),app=createApplication(f.db,process.cwd(),'demo',undefined,{},undefined,f.service);await new Promise<void>(ok=>app.server.listen(0,'127.0.0.1',ok));const origin='http://127.0.0.1:'+(app.server.address() as any).port;
 try{const session=await app.identity.createSession(f.actor.id),headers={Cookie:'eb_session='+session.token,Origin:origin,'X-CSRF-Token':session.csrf,'Content-Type':'application/json'},url=origin+'/v1/it/connections/CON-02/confirm',body=JSON.stringify({expectedVersion:f.diagnosed.version,confirmation:f.input});assert.equal((await fetch(url,{method:'POST',headers:{Cookie:headers.Cookie,Origin:origin},body})).status,403);assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({expectedVersion:f.diagnosed.version,confirmation:{...f.input,rowFilter:'invented'}})})).status,422);const valid=await fetch(url,{method:'POST',headers,body});assert.equal(valid.status,200);const c=await valid.json();assert.equal(c.confirmation.confirmedBy,f.actor.id);assert.equal((await fetch(origin+'/v1/it/connections/CON-02/test',{method:'POST',headers,body:JSON.stringify({expectedVersion:c.version})})).status,200);
 assert.equal((await fetch(origin+'/v1/it/logout',{method:'POST',headers,body:'{}'})).status,200);assert.equal((await fetch(origin+'/v1/it/connections',{headers})).status,401);
 }finally{await new Promise<void>(ok=>app.server.close(()=>ok()));await f.close();}
});
