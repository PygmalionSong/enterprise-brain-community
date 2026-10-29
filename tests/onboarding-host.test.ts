// Actual authenticated host + owned loopback metadata service; no enterprise scan.
// 实际认证宿主与自有回环元数据服务，不扫描企业网络。
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID,randomBytes} from 'node:crypto';
import {openDatabase} from '../src/db/adapter.ts';
import {migrate} from '../src/db/migrate.ts';
import {IdentityService} from '../src/identity/service.ts';
import {OperatorDirectory} from '../src/identity/operators.ts';
import {createEnterpriseApplication} from '../src/http/enterprise.ts';
import {TrafficAdmission} from '../src/enterprise/traffic-policy.ts';
import {localFetch as fetch} from '../scripts/local-http.mjs';

const password='Synthetic-Onboarding-Password-2026';
let f:any,hits=0,sourceState='original';
const original={$Version:'4.01',$EntityContainer:'Owned.Container',Owned:{Row:{$Kind:'EntityType',$Key:['Id'],Id:{$Type:'Edm.String',$Nullable:false}},Container:{$Kind:'EntityContainer',Orders:{$Collection:true,$Type:'Owned.Row'}}}};
const source=createServer((_req,res)=>{hits++;if(sourceState==='parked')return;if(sourceState==='auth'){res.writeHead(401);res.end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(sourceState==='changed'?{...original,Other:{}}:original));});
before(async()=>{
 await new Promise<void>(ok=>source.listen(0,'127.0.0.1',ok));
 const db=await openDatabase(':memory:');await migrate(db,'migrations');const enterpriseId=randomUUID();
 await db.query("INSERT INTO enterprise VALUES($1,'Owned integration','enterprise','CNY','UTC')",[enterpriseId]);
 const identity=new IdentityService(db),operators=new OperatorDirectory(db),token=await identity.issueBootstrap(enterpriseId);
 const admin=await operators.initialize(token,{username:'onboarding-admin',password});
 const config={enterpriseId,instanceId:randomUUID(),origin:'https://brain.owned.invalid',proxyToken:randomBytes(32).toString('base64url'),controlToken:randomBytes(32).toString('base64url')};
 const traffic=new TrafficAdmission({format:1,deploymentId:config.instanceId,version:0,mode:'active',events:[]},async()=>{});
 const app=await createEnterpriseApplication(db,process.cwd(),config,{traffic});
 await new Promise<void>(ok=>app.server.listen(0,'127.0.0.1',ok));const url='http://127.0.0.1:'+(app.server.address() as any).port;
 const call=(route:string,input?:unknown,session?:any,extra={})=>fetch(url+route,{method:input===undefined?'GET':'POST',redirect:'manual',headers:{'X-EB-Proxy':config.proxyToken,Origin:config.origin,'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{}),...extra},...(input===undefined?{}:{body:JSON.stringify(input)})});
 const login=async(username:string)=>{const r=await call('/v1/identity/session',{username,password});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie')!.split(';')[0],csrf:(await r.json()).csrf};};
 const adminSession=await login(admin.username);
 for(const [username,role] of [['onboarding-it','it'],['onboarding-business','executive']])assert.equal((await call('/v1/identity/operators',{username,password,role},adminSession)).status,201);
 f={db,app,traffic,config,call,adminSession,it:await login('onboarding-it'),business:await login('onboarding-business'),endpoint:'http://127.0.0.1:'+(source.address() as any).port+'/$metadata'};
});
after(async()=>{if(f){f.traffic.shutdown();await f.app.closeWorkers();await new Promise<void>(ok=>f.app.server.close(()=>ok()));await f.db.close();}source.closeAllConnections();await new Promise<void>(ok=>source.close(()=>ok()));});
const api='/v1/it/onboarding';
async function json(path:string,input?:unknown,session=f.it,status=200){const response=await f.call(api+path,input,session);const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return body;}
async function discover(){
 sourceState='original';const scope=await json('/scopes',{endpoints:[f.endpoint],ttlSeconds:900,idempotencyKey:randomUUID(),scopeAcknowledged:true},f.it,201);
 const request={scopeId:scope.id,expectedScopeVersion:scope.version,idempotencyKey:randomUUID()};
 const run=await json('/runs',request,f.it,202);let view:any;
 for(let i=0;i<100;i++){view=await json('/runs/'+run.id);if(view.state==='completed')return {scope,run:view,request};await new Promise(ok=>setTimeout(ok,10));}throw Error('owned_run_not_completed');
}
async function review(run:any){const target=run.targets[0];assert.equal(target.state,'observed');return json('/reviews',{evidenceId:target.evidenceId,expectedObservationSha256:target.observationSha256,systemName:'<img src=x onerror=alert(1)>',businessPurpose:'Read reviewed metadata',businessOwnerRole:'IT owner',identityAcknowledged:true,metadataReadAcknowledged:true,idempotencyKey:randomUUID()},f.it,201);}

test('IT-only page and API keep identity administration, CSRF and evidence authority separate',async()=>{
 assert.equal((await f.call('/connections',undefined,f.it)).status,200);
 assert.equal((await f.call('/',undefined,f.it)).headers.get('location'),'/connections');
 assert.equal((await f.call('/console',undefined,f.it)).status,403);
 assert.equal((await f.call('/connections',undefined,f.business)).status,403);
 await json('/environment',undefined,f.business,403);
 assert.equal((await f.call(api+'/plans',{endpoints:[f.endpoint]},f.it,{'X-CSRF-Token':'wrong'})).status,403);
 for(const path of ['/accept','/evidence','/code'])await json(path,{},f.it,404);
 const initial=hits,plan=await json('/plans',{endpoints:[f.endpoint,f.endpoint]});assert.equal(hits,initial);assert.equal(plan.targets.length,1);
 await json('/plans',{endpoints:[f.endpoint],enterpriseId:randomUUID()},f.it,422);
 await json('/scopes',{endpoints:[f.endpoint],idempotencyKey:randomUUID(),scopeAcknowledged:false},f.it,422);
});

test('real discovery, explicit identity review and same-key read receipt never imply business access',async()=>{
 const initial=hits,{run,request}=await discover();assert.equal(hits,initial+1);assert.equal(run.connected,false);
 const again=await json('/runs',request,f.it,202);assert.equal(again.created,false);assert.equal(hits,initial+1);
 const binding=await review(run),pending=await json('/connections/'+binding.id);assert.equal(pending.metadataReady,false);
 const input={expectedVersion:binding.version,idempotencyKey:randomUUID(),readTestAcknowledged:true};
 assert.equal((await json('/connections/'+binding.id+'/test',input)).state,'passed');assert.equal(hits,initial+2);
 const ready=await json('/connections/'+binding.id);assert.equal(ready.metadataReady,true);assert.equal(ready.systemName,'<img src=x onerror=alert(1)>');
 for(const key of ['businessDataAuthorized','processDefinitionAvailable','executable'])assert.equal(ready[key],false);
 const receipt=await json('/connections/'+binding.id+'/test',input);assert.equal(receipt.recovered,true);assert.equal(receipt.state,'passed');assert.equal(hits,initial+2);
 await json('/connections/'+binding.id+'/test',{...input,expectedVersion:ready.version},f.it,409);
});

test('changed metadata removes ready status and original evidence remains immutable',async()=>{
 const {run}=await discover(),binding=await review(run);await json('/connections/'+binding.id+'/test',{expectedVersion:1,idempotencyKey:randomUUID(),readTestAcknowledged:true});
 const old=await json('/connections/'+binding.id);sourceState='changed';
 assert.equal((await json('/connections/'+binding.id+'/test',{expectedVersion:old.version,idempotencyKey:randomUUID(),readTestAcknowledged:true})).state,'changed');
 const changed=await json('/connections/'+binding.id);assert.equal(changed.metadataReady,false);assert.equal(changed.state,'revoked');assert.equal(changed.endpoint,undefined);
 await json('/connections/'+binding.id+'/test',{expectedVersion:changed.version,idempotencyKey:randomUUID(),readTestAcknowledged:true},f.it,409);
 assert.equal((await json('/runs/'+run.id)).targets[0].observationSha256,run.targets[0].observationSha256);
});

test('scope revocation redacts evidence and invalidates a tested connection',async()=>{
 const {scope,run}=await discover(),binding=await review(run);await json('/connections/'+binding.id+'/test',{expectedVersion:1,idempotencyKey:randomUUID(),readTestAcknowledged:true});
 await json('/scopes/'+scope.id+'/revoke',{expectedVersion:scope.version});
 assert.equal((await json('/connections/'+binding.id)).metadataReady,false);
 const hidden=await json('/runs/'+run.id);assert.equal(hidden.targets[0].observation,undefined);assert.equal(JSON.stringify(hidden).includes(f.endpoint),false);
 await json('/connections/'+binding.id+'/test',{expectedVersion:2,idempotencyKey:randomUUID(),readTestAcknowledged:true},f.it,409);
});

test('HTTP policy review uses source validation and separate CSRF-protected business approval',async()=>{
 const {scope,run}=await discover(),binding=await review(run);await json('/connections/'+binding.id+'/test',{expectedVersion:1,idempotencyKey:randomUUID(),readTestAcknowledged:true});
 const context=await f.call('/v1/context',undefined,f.it).then((r:any)=>r.json()),ref={id:context.principalId,version:context.authorizationVersion,role:'it'},r=(await f.db.query('SELECT review_id FROM onboarding_binding WHERE id=$1',[binding.id])).rows[0];
 f.it.csrf=context.csrf;const input={endpointAndFieldsAcknowledged:true,policy:{format:'enterprise-brain.business-read-policy/1',enterpriseId:f.config.enterpriseId,scopeId:scope.id,scopeVersion:1,discoveryRunId:run.id,reviewId:r.review_id,reviewVersion:1,bindingId:binding.id,bindingVersion:2,owner:ref,reviewer:ref,policyReviewer:ref,metadataSha256:run.targets[0].observation.rawSha256,adapter:'odata.projected-read.v1',endpoint:new URL('Orders',f.endpoint).href,entity:'Orders',fields:['Id'],maxRows:10,maxBytes:4096,timeoutMs:1000,purpose:'Read approved order ids'}};
 const created=await f.call('/v1/business-read/policies',input,f.it),policy=await created.json();assert.equal(created.status,201,JSON.stringify(policy));assert.equal(policy.metadataValidated,true);
 const approval={expectedVersion:1,policySha256:policy.sha256,businessReadAcknowledged:true};
 assert.equal((await f.call('/v1/business-read/policies/'+policy.id+'/approve',approval,f.it)).status,403);
 assert.equal((await f.call('/v1/business-read/policies',input,f.business)).status,403);
 assert.equal((await f.call('/v1/business-read/policies/'+policy.id+'/approve',approval,f.business,{'X-CSRF-Token':'wrong'})).status,403);
 const visible=await f.call('/v1/business-read/policies/'+policy.id,undefined,f.business).then((r:any)=>r.json());assert.equal(visible.endpoint,undefined);assert.equal(visible.purpose,input.policy.purpose);
 const approved=await f.call('/v1/business-read/policies/'+policy.id+'/approve',approval,f.business),grant=await approved.json();assert.equal(approved.status,201,JSON.stringify(grant));
 assert.equal((await f.call('/v1/business-read/grants/'+grant.id+'/revoke',{expectedVersion:1},f.it)).status,403);
 assert.equal((await f.call('/v1/business-read/grants/'+grant.id+'/revoke',{expectedVersion:1},f.business)).status,200);
});

test('shutdown aborts owned workers and releases their independent traffic lease',async()=>{
 sourceState='parked';const scope=await json('/scopes',{endpoints:[f.endpoint],ttlSeconds:900,idempotencyKey:randomUUID(),scopeAcknowledged:true},f.it,201);
 const initial=hits;await json('/runs',{scopeId:scope.id,expectedScopeVersion:scope.version,idempotencyKey:randomUUID()},f.it,202);
 for(let i=0;i<100&&hits===initial;i++)await new Promise(ok=>setTimeout(ok,10));assert.equal(hits,initial+1);
 assert.equal(await f.traffic.waitForIdle(20),false);f.traffic.shutdown();await f.app.closeWorkers();assert.equal(await f.traffic.waitForIdle(1000),true);
});
