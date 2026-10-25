// ACC-39: owned second environment, real loopback HTTP/SQL, no vendor acceptance.
// ACC-39：自有第二环境，真实本机HTTP/SQL，不等于厂商验收。
import test from 'node:test';
import {confirmFixture} from './connection-fixture.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../src/db/adapter.ts';
import {migrate} from '../src/db/migrate.ts';
import {ConnectionService} from '../src/connectors/discovery.ts';
import {HttpFixtureDriver,SqlFixtureDriver} from '../src/connectors/fixture-drivers.ts';
import {LocalSource,initializeFinance} from '../src/connectors/local-source.ts';
import {createSyntheticSource} from '../src/demo/source.ts';
test('ACC-39: two owned enterprises retain same asset IDs without catalog collisions or shared facts',async()=>{
 const db=await openDatabase(':memory:'),sources:any[]=[];try{
 await migrate(db,'migrations');
 for(let i=0;i<2;i++){
 const enterpriseId=randomUUID(),id=randomUUID(),warehouse=await openDatabase(':memory:'),finance=await openDatabase(':memory:'),secret='second-environment-'+i,skus=[{id:i?'HC-B1':'HC-A1',allocation:{own:10,transfer:20,copack:30}}];
 await initializeFinance(finance,enterpriseId);await finance.query('UPDATE finance_snapshot SET available_cash_cny=$1',[i?20000000:40000000]);
 const source=await createSyntheticSource(warehouse,secret,skus);await new Promise<void>(ok=>source.server.listen(0,'127.0.0.1',ok));
 const endpoint='http://127.0.0.1:'+(source.server.address() as any).port,raw=new LocalSource(endpoint,secret,finance),http=new HttpFixtureDriver(endpoint,raw,skus,finance,{enterpriseId}),sql=new SqlFixtureDriver(finance,raw,enterpriseId);
 sources.push({warehouse,finance,source,http,sql,actor:{id,enterpriseId,role:'it',authorizationVersion:1},secret,skus});
 await db.query("INSERT INTO enterprise VALUES($1,$2,'demo','CNY','Asia/Shanghai')",[enterpriseId,'Owned environment '+i]);await db.query("INSERT INTO principal(id,enterprise_id,username,role) VALUES($1,$2,$3,'it')",[id,enterpriseId,'it-'+i]);
 }
 const service=new ConnectionService(db,sources.flatMap(s=>[s.http,s.sql]));
 for(const s of sources){
 assert.equal(service.catalog(s.actor.enterpriseId).length,2);
 const {grantId}=await service.grant(s.actor,{kind:'asset_catalog',allowlist:[s.http.target,s.sql.target],expiresAt:new Date(Date.now()+600000).toISOString(),rateLimit:120});
 for(const driver of [s.http,s.sql]){const requested=await service.request(s.actor,driver.target.assetId,grantId),diagnosed=await service.diagnose(s.actor,driver.target.assetId,requested.version);let version=diagnosed.version;
 if(driver===s.http){const badConfirmation=await confirmFixture(service,s.actor,driver.target.assetId,version,{...diagnosed.mapping,quantityUnit:'liter'});const invalid=await service.test(s.actor,driver.target.assetId,badConfirmation.version);assert.equal(invalid.state,'needs_mapping_review');assert.equal(invalid.read_enabled,false);version=invalid.version;}
 const confirmed=await confirmFixture(service,s.actor,driver.target.assetId,version,diagnosed.mapping);const active=await service.test(s.actor,driver.target.assetId,confirmed.version);assert.equal(active.state,'active');assert.equal(active.write_enabled,driver===s.http);
 }
 const page=await service.readPage(s.actor,'CON-01');assert.ok(page.rows.every(r=>r.sku===s.skus[0].id));const money=await service.readPage(s.actor,'CON-02');assert.equal(money.rows[0].enterprise_id,s.actor.enterpriseId);assert.equal(money.rows[0].availableCashCny,s===sources[0]?40000000:20000000);
 }
 const [a,b]=sources;await assert.rejects(service.grant(a.actor,{kind:'endpoint',allowlist:[b.http.target],expiresAt:new Date(Date.now()+600000).toISOString(),rateLimit:120}),/target_not_authorized/);
 await assert.rejects(service.list({...a.actor,enterpriseId:b.actor.enterpriseId}),/not_authorized/);
 const reference=randomUUID();await a.http.executeAction(reference,{origin:'own',lines:[{sku:a.skus[0].id,quantity:1}],expectedVersion:1});assert.equal(await b.http.readActionResult(reference),null);assert.equal((await b.warehouse.query('SELECT * FROM source_request')).rows.length,0);
 assert.throws(()=>new ConnectionService(db,[a.http,a.http]),/duplicate_connector_binding/);
 // The second environment can rename asset bindings without changing core code.
 // 第二环境更换源编号，不需要改核心代码；运行调用仍检查对应授权。
 const renamedHttp=new HttpFixtureDriver(b.http.target.endpoint,new LocalSource(b.http.target.endpoint,b.secret,b.finance),b.skus,b.finance,{enterpriseId:b.actor.enterpriseId,assetId:'CON-03'}),renamedSql=new SqlFixtureDriver(b.finance,new LocalSource(b.http.target.endpoint,b.secret,b.finance),b.actor.enterpriseId,{assetId:'CON-04'});
 const configured=new ConnectionService(db,[a.http,a.sql,b.http,b.sql,renamedHttp,renamedSql]),{grantId}=await configured.grant(b.actor,{kind:'asset_catalog',allowlist:[renamedHttp.target,renamedSql.target],expiresAt:new Date(Date.now()+600000).toISOString(),rateLimit:120});
 for(const d of [renamedHttp,renamedSql]){const request=await configured.request(b.actor,d.target.assetId,grantId),diagnosed=await configured.diagnose(b.actor,d.target.assetId,request.version);const confirmed=await confirmFixture(configured,b.actor,d.target.assetId,diagnosed.version);assert.equal((await configured.test(b.actor,d.target.assetId,confirmed.version)).state,'active');}
 const gates:string[]=[],client=new LocalSource(b.http.target.endpoint,b.secret,b.finance,1500,async(id,op)=>{gates.push(id);await configured.assertActive(b.actor.enterpriseId,id,op);},{httpAssetId:'CON-03',sqlAssetId:'CON-04'});
 assert.ok((await client.snapshot()).resources.every(r=>r.sku==='HC-B1'));assert.equal((await client.finance(b.actor.enterpriseId)).availableCashCny,20000000);assert.deepEqual(gates,['CON-03','CON-04']);
 await assert.rejects(configured.readPage(a.actor,'CON-03'),/not_found/);
 const wrongSecret=new LocalSource(b.http.target.endpoint,a.secret,b.finance);await assert.rejects(wrongSecret.snapshot(),/source_access_denied/);
 await configured.revoke(b.actor,grantId);await assert.rejects(client.snapshot(),/connector_not_active/);assert.ok((await configured.readPage(a.actor,'CON-01')).rows.every(r=>r.sku==='HC-A1'));
 assert.throws(()=>new LocalSource(b.http.target.endpoint,b.secret,b.finance,1500,undefined,{httpAssetId:'CON-03',sqlAssetId:'CON-03'}));
 assert.throws(()=>new HttpFixtureDriver(a.http.target.endpoint,new LocalSource(b.http.target.endpoint,b.secret,b.finance),b.skus,b.finance,{enterpriseId:b.actor.enterpriseId}),/target_not_authorized/);
 }finally{for(const s of sources){await new Promise<void>(ok=>s.source.server.close(()=>ok()));await s.finance.close();await s.warehouse.close();}await db.close();}
});
