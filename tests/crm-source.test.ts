// CON-02 owned CRM associations, consent cutoff, pagination and least privilege.
// CON-02自有CRM关联、同意时点、分页及最小权限。
import test from 'node:test';
import {confirmFixture} from './connection-fixture.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../src/db/adapter.ts';
import {migrate} from '../src/db/migrate.ts';
import {ConnectionService} from '../src/connectors/discovery.ts';
import {initializeCrmFixture,SqlCrmFixtureDriver} from '../src/connectors/crm-source.ts';
test('CRM view associates customer/consent/order, preserves cancelled state and isolates enterprises',async()=>{
 const db=await openDatabase(':memory:'),a=randomUUID(),b=randomUUID();try{
 await initializeCrmFixture(db,a);await initializeCrmFixture(db,b);await db.query("UPDATE crm_fixture_order SET net_amount_cny=123 WHERE enterprise_id=$1 AND order_code='ORDER-KA'",[b]);
 const driver=new SqlCrmFixtureDriver(db,{enterpriseId:a}),other=new SqlCrmFixtureDriver(db,{enterpriseId:b}),first=await driver.readPage(),last=await driver.readPage(first.nextCursor!);assert.equal(first.rows.length+last.rows.length,3);assert.equal(last.nextCursor,null);
 assert.equal(first.context.asOf,'2026-10-12T04:00:00Z');assert.equal(first.context.factKind,'constructed_actual');assert.equal(first.context.currency,'CNY');assert.deepEqual(first.context,last.context);
 const rows=[...first.rows,...last.rows];assert.equal(rows.find(r=>r.customer_code==='MEM-001')!.marketing_consent,true);assert.equal(rows.find(r=>r.customer_code==='MEM-002')!.marketing_consent,false);assert.equal(rows.find(r=>r.customer_code==='MEM-002')!.order_state,'cancelled');assert.equal(rows.find(r=>r.customer_code==='KA-001')!.net_amount_cny,'800000.00');assert.equal((await other.readPage()).rows[0].net_amount_cny,'123.00');
 await assert.rejects(other.readPage(first.nextCursor!),/invalid_cursor/);assert.equal((await driver.readChanges()).changes.length,3);await assert.rejects(driver.executeAction(),/unsupported/);
 const expired=new SqlCrmFixtureDriver(db,{enterpriseId:a,asOf:'2026-10-14T00:00:00Z'}),page=await expired.readPage();assert.equal(page.rows.find(r=>r.customer_code==='MEM-001')!.marketing_consent,false);await assert.rejects(expired.readPage(first.nextCursor!),/invalid_cursor/);
 const otherSource=await openDatabase(':memory:');try{await initializeCrmFixture(otherSource,a);await assert.rejects(new SqlCrmFixtureDriver(otherSource,{enterpriseId:a}).readPage(first.nextCursor!),/invalid_cursor/);}finally{await otherSource.close();}
 }finally{await db.close();}
});
test('CRM source change rejects old page, and read role cannot access base data or write',async()=>{
 const db=await openDatabase(':memory:'),enterpriseId=randomUUID();try{
 await initializeCrmFixture(db,enterpriseId);const driver=new SqlCrmFixtureDriver(db,{enterpriseId}),first=await driver.readPage();assert.equal(await driver.health(),true);
 await db.query("UPDATE crm_fixture_consent SET granted=false,version=2 WHERE enterprise_id=$1 AND customer_code='MEM-001'",[enterpriseId]);await assert.rejects(driver.readPage(first.nextCursor!),/cursor_stale/);assert.equal((await driver.readPage()).rows.find(r=>r.customer_code==='MEM-001')!.marketing_consent,false);
 const next=await driver.readPage();await initializeCrmFixture(db,enterpriseId);assert.equal((await driver.readPage(next.nextCursor!)).nextCursor,null);assert.equal((await driver.readPage()).rows.find(r=>r.customer_code==='MEM-001')!.marketing_consent,false);
 await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE crm_fixture_reader');await tx.query('SELECT * FROM crm_fixture_customer');}),/permission denied/);
 await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE crm_fixture_reader');await tx.query('UPDATE crm_fixture_order SET net_amount_cny=0');}),/permission denied/);
 await db.exec('GRANT UPDATE ON crm_fixture_order TO crm_fixture_reader');assert.equal(await driver.health(),false);await db.exec('REVOKE UPDATE ON crm_fixture_order FROM crm_fixture_reader');assert.equal(await driver.health(),true);await db.exec('REVOKE SELECT ON crm_fixture_read FROM crm_fixture_reader');assert.equal(await driver.health(),false);
 }finally{await db.close();}
});
test('CRM adapter follows the existing diagnose/map/activate/read/revoke contract without write activation',async()=>{
 const db=await openDatabase(':memory:'),source=await openDatabase(':memory:'),enterpriseId=randomUUID(),id=randomUUID();try{
 await migrate(db,'migrations');await initializeCrmFixture(source,enterpriseId);await db.query("INSERT INTO enterprise VALUES($1,'Owned CRM','demo','CNY','Asia/Shanghai')",[enterpriseId]);await db.query("INSERT INTO principal(id,enterprise_id,username,role) VALUES($1,$2,'crm-it','it')",[id,enterpriseId]);const actor={id,enterpriseId,role:'it',authorizationVersion:1},driver=new SqlCrmFixtureDriver(source,{enterpriseId}),service=new ConnectionService(db,[driver]);
 const {grantId}=await service.grant(actor,{kind:'endpoint',allowlist:[driver.target],expiresAt:new Date(Date.now()+600000).toISOString(),rateLimit:120}),request=await service.request(actor,'CON-02',grantId),diagnosed=await service.diagnose(actor,'CON-02',request.version),badConfirmation=await confirmFixture(service,actor,'CON-02',diagnosed.version,{...diagnosed.mapping,currency:'USD'}),bad=await service.test(actor,'CON-02',badConfirmation.version);assert.equal(bad.state,'needs_mapping_review');const confirmed=await confirmFixture(service,actor,'CON-02',bad.version,diagnosed.mapping);const active=await service.test(actor,'CON-02',confirmed.version);assert.equal(active.state,'active');assert.equal(active.write_enabled,false);assert.equal(active.report.readRows,3);assert.equal((await service.readPage(actor,'CON-02')).rows.length,2);await assert.rejects(service.assertActive(enterpriseId,'CON-02','write'),/connector_not_active/);await service.revoke(actor,grantId);await assert.rejects(service.readPage(actor,'CON-02'),/connector_not_active/);
 }finally{await source.close();await db.close();}
});
