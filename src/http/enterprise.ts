// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
import {BusinessReadGrants} from '../onboarding/business-read-grants.ts';
import {businessReadRoute} from '../onboarding/business-read-http-route.ts';
import {DiscoveryStore} from '../onboarding/discovery-store.ts';
import {DiscoveryRunner} from '../onboarding/discovery-runner.ts';
import {MetadataConnections} from '../onboarding/metadata-connections.ts';
import {onboardingRoute} from '../onboarding/http.ts';
import {GraphMetadata} from '../runtime/graph-metadata.ts';import {graphMetadataRequest} from '../runtime/graph-metadata-http.ts';
import {BusinessHistory} from '../runtime/business-history.ts';
import {BusinessAnalysisLedger} from '../runtime/business-analysis-ledger.ts';import {BusinessAnalysisResults} from '../runtime/business-analysis-results.ts';import {DurableBusinessAnalyzer} from '../runtime/business-analyzer.ts';
// Independent enterprise API host: no demo seed, session shortcut or fixture runtime.
// 独立企业API宿主：没有演示种子、会话捷径或构造源运行器。
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import type {Database} from '../db/adapter.ts';
import {readSchemaInventory,inspectSchemaHealth} from '../db/schema-health.ts';
import {IdentityService,digest} from '../identity/service.ts';
import {OperatorDirectory} from '../identity/operators.ts';
import {ProcessRegistry} from '../connectors/process-registry.ts';
import {processItRoute} from '../connectors/process-http.ts';
import {GraphService} from '../runtime/graph-service.ts';
import {graphRoute} from '../runtime/graph-http.ts';
import {GraphSupervisor,supervisionRuntimeFingerprint} from '../runtime/graph-supervision.ts';
import type {GraphToolCatalog} from '../runtime/graph-contracts.ts';
import {enterpriseGraphTools} from '../runtime/enterprise-tools.ts';
import {enterpriseHostSchema,localBackendRequest,secretMatches,canonicalRequestUrl,type EnterpriseHostConfiguration} from './enterprise-policy.ts';
import {TrafficAdmission} from '../enterprise/traffic-policy.ts';
import {PlanningLedger} from '../runtime/planning-ledger.ts';
import {CandidateAdoption} from '../runtime/candidate-adoption.ts';
import {BusinessObservations} from '../runtime/business-observations.ts';
import {AnalysisPolicyService} from '../runtime/analysis-policy.ts';
import {PlanningContext} from '../runtime/planning-context.ts';
import {DurableGraphPlanner,type PlanningModelInstallation} from '../runtime/graph-planner.ts';
import {inspectNativeRuntime} from '../db/native-runtime-preflight.ts';
import {isVerifiedNativeRuntimeConnection,acquireNativeRuntimeOwnership,type NativeRuntimeOwnership} from '../db/native-runtime-connection.ts';
import {isAbsolute,resolve} from 'node:path';

const cookieName='__Host-eb_session';
const tokenOf=(req:IncomingMessage)=>(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)??'';
const sessionCookie=(token:string)=>`${cookieName}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${token?43200:0}`;
class HostError extends Error {status:number;constructor(status:number,code:string){super(code);this.status=status;}}
async function body(req:IncomingMessage){if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']??'')))throw new HostError(415,'json_required');const chunks:Buffer[]=[];let count=0;for await(const chunk of req){const b=Buffer.from(chunk);if((count+=b.length)>65536)throw new HostError(413,'input_limit');chunks.push(b);}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new HostError(400,'invalid_json');}}

export type EnterpriseApplicationExtensions={nativeBackup?:{status:()=>Promise<object>;start:(file:string,sha256:string)=>Promise<object>;cancel:(input:unknown)=>Promise<object>;assertIdle:()=>Promise<void>};tools?:GraphToolCatalog;stop?:()=>void;traffic?:TrafficAdmission;supervisionRuntimeSha256?:string;model?:{state:string;installation?:PlanningModelInstallation;status?:()=>Promise<unknown>}};
export async function createEnterpriseApplication(db:Database,root:string,input:EnterpriseHostConfiguration,extensions:EnterpriseApplicationExtensions={},now=()=>new Date()){
 const config=enterpriseHostSchema.parse(input);if(db.profile!=='pglite')throw Error('enterprise_database_profile_unverified');
 return buildEnterpriseApplication(db,root,config,extensions,now);
}
// Loader executes only inside acquired native ownership;never an HTTP-supplied callback.
// 加载器只在原生归属取得后执行，不接受HTTP提供的回调。
export type NativeEnterpriseApplicationExtensions=EnterpriseApplicationExtensions&{loadOwnedModel?:()=>Promise<NonNullable<EnterpriseApplicationExtensions['model']>>;loadOwnedTools?:()=>Promise<GraphToolCatalog>};
const nativeHostInput=z.object({enterpriseId:z.uuid(),runtimeRole:z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),ownershipAcknowledged:z.literal(true)}).strict();
export const nativeHostGrants:ReadonlyArray<readonly [string,string]>=Object.freeze(([['principal','SELECT'],['principal','INSERT'],['principal','UPDATE'],['enterprise','SELECT'],['enterprise','UPDATE'],['auth_session','SELECT'],['auth_session','INSERT'],['auth_session','UPDATE'],['identity_administrator','SELECT'],['identity_administrator','INSERT'],['identity_administrator','UPDATE'],['audit_event','INSERT'],['process_registry','SELECT'],['schema_migration','SELECT']] as [string,string][]).map(row=>Object.freeze(row)));
// Explicit trusted programmatic entry;never alter a driver profile to bypass the old host.
// 显式受信程序入口；不修改驱动profile绕过旧宿主。
export async function createNativeEnterpriseApplication(db:Database,root:string,input:EnterpriseHostConfiguration,qualificationInput:unknown,extensions:NativeEnterpriseApplicationExtensions={},now=()=>new Date()){
 const parsed=nativeHostInput.safeParse(qualificationInput),host=enterpriseHostSchema.safeParse(input);
 if(extensions.loadOwnedModel!==undefined&&(typeof extensions.loadOwnedModel!=='function'||extensions.model!==undefined))throw Error('native_enterprise_input_invalid');
 if(extensions.loadOwnedTools!==undefined&&(typeof extensions.loadOwnedTools!=='function'||extensions.tools!==undefined))throw Error('native_enterprise_input_invalid');
 if(!parsed.success||!host.success||parsed.data.enterpriseId!==host.data.enterpriseId||typeof root!=='string'||root.length>1024||!isAbsolute(root)||resolve(root)!==root)throw Error('native_enterprise_input_invalid');
 if(db.profile!=='postgres')throw Error('native_enterprise_postgres_required');
 const q=parsed.data;
 if(!isVerifiedNativeRuntimeConnection(db,q.enterpriseId,q.runtimeRole))throw Error('native_enterprise_connection_required');
 const admission=extensions.traffic??new TrafficAdmission({format:1,deploymentId:host.data.instanceId,version:0,mode:'active',events:[]},async()=>{}),nativeExtensions={...extensions,traffic:admission};
 let ownership:NativeRuntimeOwnership|undefined;
 try{
  const qualify=async()=>{
  const expectedMigrations=await readSchemaInventory(join(root,'migrations')),qualification=await inspectNativeRuntime(db,{enterpriseId:q.enterpriseId,runtimeRole:q.runtimeRole,expectedMigrations});
  if(!qualification.prerequisitesMet)throw Error('native_enterprise_runtime_unqualified');
  const grants=await db.transaction(async tx=>{
   await tx.exec("SET TRANSACTION READ ONLY; SET LOCAL statement_timeout='3000'; SET LOCAL lock_timeout='1000'");
   const params:unknown[]=[q.runtimeRole,q.enterpriseId],columns=nativeHostGrants.map(([table,privilege],i)=>{params.push('public.'+table,privilege);return 'COALESCE(pg_catalog.has_table_privilege(current_user,$'+(i*2+3)+',$'+(i*2+4)+'),false) AS p'+i;});
   const rows=(await tx.query("SELECT current_user=$1 AND session_user=$1 AND current_setting('app.enterprise_id',true)=$2 AS identity_matches,EXISTS(SELECT 1 FROM pg_catalog.pg_stat_ssl WHERE pid=pg_catalog.pg_backend_pid() AND ssl) AS transport_verified,"+columns.join(','),params)).rows;
   return {transport:rows.length===1&&rows[0].transport_verified===true,grants:rows.length===1&&rows[0].identity_matches===true&&nativeHostGrants.every((_,i)=>rows[0]['p'+i]===true)};
  });
  if(!grants.transport)throw Error('native_enterprise_transport_unverified');if(!grants.grants)throw Error('native_enterprise_workload_grants_missing');
  };await qualify();
  ownership=await acquireNativeRuntimeOwnership(db,{ownershipAcknowledged:q.ownershipAcknowledged},()=>{admission.shutdown();});
  const owner=ownership;let closing:Promise<void>|undefined;if(extensions.loadOwnedModel){const loaded=await extensions.loadOwnedModel();if(!owner.isActive()||!isVerifiedNativeRuntimeConnection(db,q.enterpriseId,q.runtimeRole))throw Error('native_runtime_ownership_unavailable');await qualify();nativeExtensions.model=loaded;}if(extensions.loadOwnedTools){const loaded=await extensions.loadOwnedTools();if(!owner.isActive()||!isVerifiedNativeRuntimeConnection(db,q.enterpriseId,q.runtimeRole))throw Error('native_runtime_ownership_unavailable');await qualify();nativeExtensions.tools=loaded;}const application=await buildEnterpriseApplication(db,root,host.data,nativeExtensions,now,()=>owner.isActive()&&!closing);
  if(!owner.isActive())throw Error('native_runtime_ownership_unavailable');
  const close=()=>closing??=(async()=>{admission.shutdown();await application.closeWorkers();if(!await admission.waitForIdle(5000))throw Error('enterprise_traffic_drain_timeout');if(application.server.listening)await new Promise<void>((ok,fail)=>application.server.close(e=>e?fail(e):ok()));await owner.release();})().catch(e=>{closing=undefined;throw e;});
  application.server.once('close',()=>{void close().catch(()=>{});});return {...application,close};
 }catch(e){await ownership?.release();const code=e instanceof Error?e.message:'';throw Error(['native_enterprise_runtime_unqualified','native_enterprise_transport_unverified','native_enterprise_workload_grants_missing','enterprise_configuration_mismatch','enterprise_initialization_required','native_runtime_database_in_use','native_runtime_previous_connections_present','native_runtime_ownership_connection_used','native_runtime_ownership_unavailable','native_runtime_verified_connection_required','native_runtime_environment_conflict'].includes(code)?code:'native_enterprise_unavailable');}
}
async function buildEnterpriseApplication(db:Database,root:string,input:EnterpriseHostConfiguration,extensions:EnterpriseApplicationExtensions={},now=()=>new Date(),runtimeReady?:()=>boolean){
 const config=enterpriseHostSchema.parse(input);const expectedMigrations=await readSchemaInventory(join(root,'migrations'));
 const enterprise=(await db.query<any>('SELECT environment FROM enterprise WHERE id=$1',[config.enterpriseId])).rows[0];if(enterprise?.environment!=='enterprise')throw Error('enterprise_configuration_mismatch');
 const identities=(await db.query<any>("SELECT count(*) n FROM principal p JOIN identity_administrator a ON a.principal_id=p.id AND a.enterprise_id=p.enterprise_id WHERE p.enterprise_id=$1 AND p.role='it' AND NOT p.disabled AND a.enabled",[config.enterpriseId])).rows[0];if(Number(identities.n)<1)throw Error('enterprise_initialization_required');
 const identity=new IdentityService(db,now),operators=new OperatorDirectory(db,now),processes=new ProcessRegistry(db,root),graph=new GraphService(db,extensions.tools??enterpriseGraphTools(db),now);
 const supervisor=extensions.supervisionRuntimeSha256?new GraphSupervisor(db,graph,supervisionRuntimeFingerprint(extensions.supervisionRuntimeSha256,(extensions.tools??enterpriseGraphTools(db)).describe()),now):undefined;
 const adoption=new CandidateAdoption(db,graph,now),observations=new BusinessObservations(db,graph,now),analysis=new AnalysisPolicyService(db,root,graph,observations,now);
 const analysisLedger=new BusinessAnalysisLedger(db,analysis,now),analysisResults=new BusinessAnalysisResults(db,analysis,analysisLedger,now),analyzer=new DurableBusinessAnalyzer(analysisLedger,analysisResults,extensions.model?.installation,now);
 const history=new BusinessHistory(db,graph,now),metadata=new GraphMetadata(db,now);
 const planner=new DurableGraphPlanner(new PlanningLedger(db,now),new PlanningContext(graph),extensions.model?.installation,now);
 const attempts=new Map<string,{failures:number;expires:number}>();let windowStart=now().getTime(),loginCalls=0,activeLogins=0;
 const discoveryStore=new DiscoveryStore(db),discoveryRunner=new DiscoveryRunner(discoveryStore,()=> (!runtimeReady||runtimeReady())&&!extensions.traffic?.isStopping()),metadataConnections=new MetadataConnections(db,discoveryStore),businessReadGrants=new BusinessReadGrants(db);
 const launchDiscovery=(actor:import('../identity/service.ts').Actor,id:string)=>{
  if(runtimeReady&&!runtimeReady())throw new HostError(503,'enterprise_runtime_unavailable');
  const release=extensions.traffic?.admit();if(extensions.traffic&&!release)throw new HostError(503,'enterprise_traffic_parked');
  void discoveryRunner.start(actor,id).catch(()=>{}).finally(()=>release?.());
 };
 const server=createServer(async(req,res)=>{
  const correlation=randomUUID();let releaseTraffic:(()=>void)|undefined;
  const json=(status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});res.end(JSON.stringify(value));};
  try{
   if(!localBackendRequest(req))throw new HostError(403,'backend_denied');const url=canonicalRequestUrl(req,config.origin);if(url.search&&!graphMetadataRequest(req.method,url.pathname))throw new HostError(422,'query_denied');
   if(url.pathname==='/health'&&req.method==='GET'){const runtime=runtimeReady?runtimeReady():true,schema=runtime?await inspectSchemaHealth(db,expectedMigrations):{state:'unavailable' as const,applied:null,expected:expectedMigrations.length},ready=schema.state==='current'&&runtime;json(ready?200:503,{application:'enterprise-brain',mode:'enterprise',status:ready?'ready':'unavailable',instanceId:config.instanceId,schema:schema.applied,expectedSchema:schema.expected,schemaState:schema.state,runtime:runtimeReady?{state:runtime?'owned':'unavailable'}:undefined,traffic:extensions.traffic?{...extensions.traffic.status(),stopping:extensions.traffic.isStopping()}:undefined,database:db.profile,model:extensions.model?.state??'not_configured',tools:'installed-contracts-only'});return;}
   if(url.pathname.startsWith('/_dev/')||url.pathname.startsWith('/v1/dev/')){json(404,{code:'not_found'});return;}
   if(url.pathname==='/ops/stop'&&req.method==='POST'){if(!extensions.stop||req.headers.origin||!secretMatches(req.headers['x-local-control'],config.controlToken))throw new HostError(403,'control_denied');if(extensions.nativeBackup){try{await extensions.nativeBackup.assertIdle();}catch{throw new HostError(409,'native_backup_task_pending');}}res.once('finish',extensions.stop);json(200,{status:'stopping',instanceId:config.instanceId});return;}
   if(url.pathname==='/ops/native-backup'){
    if(!extensions.nativeBackup||req.headers.origin||req.headers['x-eb-proxy']||!secretMatches(req.headers['x-local-control'],config.controlToken))throw new HostError(403,'control_denied');
    try{if(req.method==='GET'){json(200,{instanceId:config.instanceId,task:await extensions.nativeBackup.status()});return;}if(req.method!=='POST')throw new HostError(405,'method_not_allowed');const path=z.string().max(1024).refine(p=>isAbsolute(p)&&resolve(p)===p),q=z.discriminatedUnion('action',[z.object({instanceId:z.uuid(),action:z.literal('start'),inputFile:path,inputSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),z.object({instanceId:z.uuid(),action:z.literal('cancel'),id:z.uuid(),expectedVersion:z.number().int().positive()}).strict()]).parse(await body(req));if(q.instanceId!==config.instanceId)throw new HostError(409,'enterprise_instance_mismatch');if(q.action==='start'){if(runtimeReady&&!runtimeReady())throw new HostError(503,'enterprise_runtime_unavailable');if((await inspectSchemaHealth(db,expectedMigrations)).state!=='current')throw new HostError(503,'enterprise_schema_not_ready');json(202,{instanceId:config.instanceId,task:await extensions.nativeBackup.start(q.inputFile,q.inputSha256)});}else json(202,{instanceId:config.instanceId,...await extensions.nativeBackup.cancel({id:q.id,expectedVersion:q.expectedVersion})});return;
    }catch(e){if(e instanceof HostError||e instanceof z.ZodError)throw e;const code=(e as Error).message;if(/^native_backup_[a-z_]+$/.test(code))throw new HostError(409,code);throw e;}
   }
   if(url.pathname==='/ops/model-status'&&req.method==='GET'){if(!extensions.model?.status||req.headers.origin||req.headers['x-eb-proxy']||!secretMatches(req.headers['x-local-control'],config.controlToken))throw new HostError(403,'control_denied');json(200,{instanceId:config.instanceId,hostModel:extensions.model.state,...await extensions.model.status() as object});return;}
   if(url.pathname==='/ops/traffic'){
    if(!extensions.traffic||req.headers.origin||req.headers['x-eb-proxy']||!secretMatches(req.headers['x-local-control'],config.controlToken))throw new HostError(403,'control_denied');
    if(req.method==='GET'){json(200,{instanceId:config.instanceId,...extensions.traffic.status(),stopping:extensions.traffic.isStopping()});return;}
    if(req.method!=='POST')throw new HostError(405,'method_not_allowed');const q=z.object({instanceId:z.uuid(),mode:z.enum(['active','parked']),expectedVersion:z.number().int().min(0),waitMs:z.number().int().min(0).max(5000).default(1000)}).strict().parse(await body(req));if(q.instanceId!==config.instanceId)throw new HostError(409,'enterprise_instance_mismatch');if(extensions.nativeBackup){try{await extensions.nativeBackup.assertIdle();}catch{throw new HostError(409,'native_backup_task_pending');}}if(q.mode==='active'&&runtimeReady&&!runtimeReady())throw new HostError(503,'enterprise_runtime_unavailable');if(q.mode==='active'&&(await inspectSchemaHealth(db,expectedMigrations)).state!=='current')throw new HostError(503,'enterprise_schema_not_ready');
    try{const result=await extensions.traffic.change(q.mode,{expectedVersion:q.expectedVersion,waitMs:q.waitMs});json(result.drained?200:202,{instanceId:config.instanceId,...result});}catch(e){const code=(e as Error).message;if(['enterprise_traffic_conflict','enterprise_traffic_not_drained','enterprise_stopping'].includes(code))throw new HostError(409,code);throw e;}return;
   }
   if(!secretMatches(req.headers['x-eb-proxy'],config.proxyToken))throw new HostError(403,'proxy_denied');
   if(runtimeReady&&!runtimeReady())throw new HostError(503,'enterprise_runtime_unavailable');
   if((await inspectSchemaHealth(db,expectedMigrations)).state!=='current')throw new HostError(503,'enterprise_schema_not_ready');
   if(extensions.traffic){const admission=extensions.traffic.admit();if(!admission)throw new HostError(503,extensions.traffic.isStopping()?'enterprise_stopping':'enterprise_traffic_parked');releaseTraffic=admission;}
   if(!['GET','POST'].includes(req.method??''))throw new HostError(405,'method_not_allowed');
   if(req.method==='POST'&&req.headers.origin!==config.origin)throw new HostError(403,'origin_denied');
   if(url.pathname==='/v1/identity/session'&&req.method==='POST'){
    const q=z.object({username:z.string().min(3).max(64),password:z.string().min(1).max(72)}).strict().parse(await body(req)),time=now().getTime(),key=digest(q.username);
    if(time-windowStart>=60000){windowStart=time;loginCalls=0;}for(const [k,v]of attempts)if(v.expires<=time)attempts.delete(k);
    const prior=attempts.get(key);if(activeLogins>=2||++loginCalls>20||prior&&prior.failures>=5||!prior&&attempts.size>=256){res.setHeader('Retry-After','60');throw new HostError(429,'login_limited');}
    activeLogins++;try{
     const session=await identity.login(config.enterpriseId,q.username,q.password);const previous=tokenOf(req);if(previous)await identity.logoutSession(previous);attempts.delete(key);res.setHeader('Set-Cookie',sessionCookie(session.token));json(200,{csrf:session.csrf});
    }catch{const live=attempts.get(key);attempts.set(key,{failures:(live?.failures??0)+1,expires:live?.expires??time+900000});throw new HostError(401,'invalid_credentials');}finally{activeLogins--;}
    return;
   }
   const staticAsset=url.pathname==='/enterprise.js'?'app.js':url.pathname==='/enterprise.css'?'style.css':null;
   const page=staticAsset?null:url.pathname==='/login'?'login':url.pathname==='/console'?'console':url.pathname==='/workspace'?'workspace':url.pathname==='/connections'?'onboarding':null;
   if(req.method==='GET'&&(staticAsset||page==='login')){const file=staticAsset??'index.html',data=await readFile(join(root,'dist/enterprise',file));res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'});res.end(page?data.toString('utf8').replace('__ENTERPRISE_PAGE__',page):data);return;}
   const token=tokenOf(req),actor=await identity.authenticate(token),current=actor?.enterpriseId===config.enterpriseId?actor:null;
   if(req.method==='GET'&&url.pathname==='/'){let target='/login';if(current){target='/workspace';if(current.role==='it'){target='/connections';try{await operators.list(current);target='/console';}catch(e){if((e as Error).message!=='not_authorized')throw e;}}}res.writeHead(303,{Location:target,'Cache-Control':'no-store'});res.end();return;}
   if(!current)throw new HostError(401,'authentication_required');
   if(req.method==='GET'&&page){if(page==='console')await operators.list(current);if(page==='onboarding'&&current.role!=='it')throw new HostError(403,'not_authorized');const data=await readFile(join(root,'dist/enterprise/index.html'),'utf8');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'});res.end(data.replace('__ENTERPRISE_PAGE__',page));return;}
   if(!actor)throw new HostError(401,'authentication_required');
   if(url.pathname==='/v1/context'&&req.method==='GET'){json(200,{principalId:actor.id,role:actor.role,authorizationVersion:actor.authorizationVersion,csrf:await identity.csrfForSession(token)});return;}
   if(url.pathname.startsWith('/v1/identity/')){
    if(req.method==='POST'&&!await identity.validateCsrf(token,String(req.headers['x-csrf-token']??''),String(req.headers.origin??''),config.origin))throw new HostError(403,'csrf_denied');
    if(url.pathname==='/v1/identity/logout'&&req.method==='POST'){z.object({}).strict().parse(await body(req));await identity.logoutSession(token);res.setHeader('Set-Cookie',sessionCookie(''));json(200,{loggedOut:true});return;}
    if(url.pathname==='/v1/identity/operators'&&req.method==='GET'){json(200,await operators.list(actor));return;}
    if(url.pathname==='/v1/identity/operators'&&req.method==='POST'){json(201,await operators.create(actor,await body(req)));return;}
    const match=/^\/v1\/identity\/operators\/([a-f0-9-]{36})\/(change|password|revoke-sessions)$/.exec(url.pathname);
    if(match&&req.method==='POST'){
     const value=await body(req),version=z.number().int().positive();let result;
     if(match[2]==='change'){const q=z.object({expectedVersion:version,changes:z.unknown()}).strict().parse(value);result=await operators.change(actor,match[1],q.expectedVersion,q.changes);}
     else if(match[2]==='password'){const q=z.object({expectedVersion:version,password:z.string().max(72)}).strict().parse(value);result=await operators.resetPassword(actor,match[1],q.expectedVersion,q.password);}
     else{const q=z.object({expectedVersion:version}).strict().parse(value);result=await operators.revokeSessions(actor,match[1],q.expectedVersion);}
     json(200,result);return;
    }
   }
   if(await businessReadRoute(req,res,url,actor,identity,token,config.origin,businessReadGrants))return;
   if(await onboardingRoute(req,res,url,actor,identity,token,{store:discoveryStore,runner:discoveryRunner,connections:metadataConnections,origin:config.origin,native:db.profile==='postgres',launch:launchDiscovery}))return;
   if(await processItRoute(req,res,url,actor,identity,token,processes))return;
   if(await graphRoute(req,res,url,actor,identity,token,graph,supervisor,planner,adoption,observations,analysis,analyzer,history,metadata))return;
   // Never serve the reference cockpit or its fallback business data here.
   // 此处不提供参考驾驶舱及其业务数据回退。
   json(404,{code:'not_found'});
  }catch(e){const raw=e instanceof Error?e.message:'',known=['operator_conflict','operator_username_conflict','operator_last_administrator','operator_admin_role_required','operator_capacity','not_authorized','not_found'];const code=e instanceof HostError?e.message:e instanceof z.ZodError?'invalid_input':known.includes(raw)?raw:'enterprise_unavailable',status=e instanceof HostError?e.status:e instanceof z.ZodError?422:raw==='not_authorized'?403:raw==='not_found'?404:raw==='operator_capacity'?429:known.includes(raw)?409:503;json(status,{code,correlationId:correlation});}finally{releaseTraffic?.();}
 });
 server.headersTimeout=5000;server.requestTimeout=10000;server.keepAliveTimeout=5000;server.maxHeadersCount=40;
 server.once('close',()=>{void discoveryRunner.close().catch(()=>{});});
 return {server,identity,operators,closeWorkers:()=>discoveryRunner.close(),onboarding:discoveryRunner,discoveryStore,metadataConnections,graph,supervisor,planner,adoption,observations,analysis,analyzer,ready:async()=>(!runtimeReady||runtimeReady())&&(await inspectSchemaHealth(db,expectedMigrations)).state==='current'};
}
