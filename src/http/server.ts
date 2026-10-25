// Loopback development application. / 本机开发应用。
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import {readSchemaInventory,inspectSchemaHealth} from '../db/schema-health.ts';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { IdentityService } from '../identity/service.ts';
import { overview, stageView, metricsQuery } from '../core/repository.ts';
import { DEMO_EXECUTIVE } from '../industry/seed.ts';
import type { Database } from '../db/adapter.ts';
import type { RuntimeService } from '../runtime/service.ts';
import {runtimeRoute} from '../runtime/http.ts';
import {connectionRoute} from '../connectors/http.ts';
import type {ConnectionService} from '../connectors/discovery.ts';
import {operatingRoute} from '../core/operating-http.ts';
import type {OperatingService} from '../core/operating-service.ts';
import {DEMO_IT} from '../connectors/bootstrap.ts';
import {CustomerCaseService} from '../core/customer-case.ts';
import {EventIngress} from '../ingress/events.ts';
import {eventWebhook,eventItRoute} from '../ingress/http.ts';
import {FileImports} from '../ingress/imports.ts';
import {importItRoute} from '../ingress/import-http.ts';
import {ProcessRegistry} from '../connectors/process-registry.ts';
import {processItRoute} from '../connectors/process-http.ts';
import {GraphService} from '../runtime/graph-service.ts';
import {installedGraphTools} from '../runtime/graph-tools.ts';
import {graphRoute} from '../runtime/graph-http.ts';
const json=(res:ServerResponse,status:number,body:unknown)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
const cookieToken=(req:IncomingMessage)=>(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('eb_session='))?.slice(11)??'';
export function createApplication(db:Database,root:string,mode='demo',control?:{token:string;instanceId?:string;stop:()=>void},allocations:Record<string,{quantity:number}>={},runtime?:RuntimeService,connections?:ConnectionService,operating?:OperatingService,events?:EventIngress,graph?:GraphService) {
 if(mode!=='demo')throw new Error('enterprise_mode_not_enabled');
 events??=connections?new EventIngress(db,connections,[]):undefined;
 const identity=new IdentityService(db);
 const imports=new FileImports(db);
 const processes=new ProcessRegistry(db,root);
 graph??=new GraphService(db,installedGraphTools(db,runtime));
 const server=createServer(async(req,res)=>{
  const correlation=randomUUID();
  try {
   const host=req.headers.host??'';if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)){json(res,403,{code:'host_denied'});return;}
   const url=new URL(req.url??'/','http://'+host);
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
   res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
   if(['/_dev/stop','/_dev/it-session'].includes(url.pathname)&&req.method==='POST'&&control){
    const supplied=Buffer.from(String(req.headers['x-local-control']??'')),expected=Buffer.from(control.token);
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){json(res,403,{code:'control_denied'});return;}
    if(url.pathname==='/_dev/it-session'){if(!connections){json(res,404,{code:'not_found'});return;}if(req.headers.origin&&req.headers.origin!==url.origin){json(res,403,{code:'control_denied'});return;}const session=await identity.createSession(DEMO_IT);res.setHeader('Set-Cookie',`eb_session=${session.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);json(res,200,{csrf:session.csrf});return;}
    res.once('finish',control.stop);json(res,200,{status:'stopping'});return;
   }
   if(events&&await eventWebhook(req,res,url,events))return;
   if(req.method!=='GET'&&!(req.method==='POST'&&(runtime&&/^\/v1\/(runs|plans|cases|dev\/runtime)/.test(url.pathname)||connections&&url.pathname.startsWith('/v1/it/')||operating&&url.pathname.startsWith('/v1/operating/')||graph&&(url.pathname.startsWith('/v1/graph/')||url.pathname.startsWith('/v1/it/graph/'))))){json(res,405,{code:'read_only_stage',business_message_key:'readOnly',correlation_id:correlation});return;}
   if(url.pathname==='/health'){
    const inventory=await readSchemaInventory(join(root,'migrations')),schema=await inspectSchemaHealth(db,inventory),migrations=schema.applied;
    const ready=schema.state==='current'&&(!runtime||runtime.healthy());json(res,ready?200:503,{application:'enterprise-brain',status:ready?'ready':'unavailable',instanceId:control?.instanceId??null,database:db.profile,mode,model:'not_configured',runtime:runtime?'mock-model-controlled-sources':'not_started',connectors:connections?'local-catalog-controlled':'not_started',schema:migrations});return;
   }
   if(['/','/app.js','/style.css','/it','/it.js','/it.css'].includes(url.pathname)){
    // Only the public loopback reference entry may replace an unusable demo session.
    // 仅本机参考首页可替换不可用的演示会话，API及企业入口仍严格拒绝。
    const localSession=cookieToken(req);
    if(url.pathname==='/'&&(!localSession||!await identity.authenticate(localSession))){
     const s=await identity.createSession(DEMO_EXECUTIVE);res.setHeader('Set-Cookie',`eb_session=${s.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);
    }
    const file=url.pathname==='/'?'index.html':url.pathname==='/it'?'it.html':url.pathname.slice(1),data=await readFile(join(root,'dist/web',file));
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(data);return;
   }
   const actor=await identity.authenticate(cookieToken(req));if(!actor){json(res,401,{code:'authentication_required',business_message_key:'denied',correlation_id:correlation});return;}
   if(url.pathname==='/v1/context'){json(res,200,{role:actor.role,authorizationVersion:actor.authorizationVersion,...(runtime||connections||operating||graph)?{csrf:await identity.csrfForSession(cookieToken(req))}: {}});return;}
   if(graph&&await graphRoute(req,res,url,actor,identity,cookieToken(req),graph))return;
   if(req.method==='GET'&&url.pathname==='/v1/customer-case'&&connections){if(url.search){json(res,422,{code:'invalid_context'});return;}try{json(res,200,await new CustomerCaseService(db,connections).read(actor));}catch(e){const denied=['business_access_denied','not_authorized'].includes(e instanceof Error?e.message:'');json(res,denied?403:503,{code:denied?'business_access_denied':'customer_case_unavailable'});}return;}
   if(events&&await eventItRoute(req,res,url,actor,identity,cookieToken(req),events))return;
   if(connections&&await importItRoute(req,res,url,actor,identity,cookieToken(req),imports))return;
   if(connections&&await processItRoute(req,res,url,actor,identity,cookieToken(req),processes))return;
   if(operating&&await operatingRoute(req,res,url,actor,identity,cookieToken(req),db,operating))return;
   if(connections&&await connectionRoute(req,res,url,actor,identity,cookieToken(req),connections,db))return;
   if(runtime&&await runtimeRoute(req,res,url,actor,identity,cookieToken(req),runtime))return;
   if(url.pathname==='/v1/overview'){json(res,200,{...await overview(db,actor),allocations});return;}
   if(url.pathname==='/v1/metrics'){json(res,200,(await metricsQuery(db,actor,url.searchParams.get('scope')??'SOUTH',url.searchParams.get('start')??'2026-10-12',url.searchParams.get('end')??'2026-10-19',url.searchParams.get('fact_kind')??'scenario_plan')).rows);return;}
   const match=/^\/v1\/processes\/([a-z]+)\/stages\/([a-z]+-\d)$/.exec(url.pathname);
   if(match){json(res,200,await stageView(db,actor,match[1],match[2]));return;}
   json(res,404,{code:'not_found',business_message_key:'empty',correlation_id:correlation});
  }catch(e){const code=e instanceof Error?e.message:'request_failed';json(res,code==='business_access_denied'?403:code==='stage_not_found'?404:code==='invalid_context'?422:500,{code:code==='request_failed'?'request_failed':['business_access_denied','stage_not_found','invalid_context'].includes(code)?code:'request_failed',business_message_key:code==='business_access_denied'?'denied':'failed',correlation_id:correlation});}
 });
 return {server,identity};
}
