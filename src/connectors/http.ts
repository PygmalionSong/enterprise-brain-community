// Separate IT plane, server-authenticated and CSRF protected. / 独立IT控制面。
import type {IncomingMessage,ServerResponse} from 'node:http';
import {z} from 'zod';
import type {Actor,IdentityService} from '../identity/service.ts';
import type {ConnectionService} from './discovery.ts';
import {SynchronizationService} from './synchronization.ts';
import {SynchronizationScheduler} from './scheduling.ts';
import type {Database} from '../db/adapter.ts';
export async function connectionRoute(req:IncomingMessage,res:ServerResponse,url:URL,actor:Actor,identity:IdentityService,token:string,service:ConnectionService,db:Database){
 if(!url.pathname.startsWith('/v1/it/'))return false;
 const json=(status:number,body:unknown)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 if(actor.role!=='it'){json(403,{code:'not_authorized'});return true;}if(!['GET','POST'].includes(req.method??'')){json(405,{code:'method_not_allowed'});return true;}
 if(req.method==='POST'&&!await identity.validateCsrf(token,String(req.headers['x-csrf-token']??''),String(req.headers.origin??''),url.origin)){json(403,{code:'not_authorized'});return true;}
 try{let input:unknown={};if(req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>32768)throw Error('input_limit');}input=JSON.parse(body);}
  const match=/^\/v1\/it\/connections\/(CON-\d{2})(?:\/(diagnose|confirm|test|sync|schedule|projection|revisions|read))?$/.exec(url.pathname),revoke=/^\/v1\/it\/grants\/([a-f0-9-]{36})\/revoke$/.exec(url.pathname);
  if(req.method==='GET'&&url.pathname==='/v1/it/catalog'){json(200,service.catalog(actor.enterpriseId));return true;}
  if(req.method==='GET'&&url.pathname==='/v1/it/connections'){json(200,await service.list(actor));return true;}
  if(req.method==='POST'&&url.pathname==='/v1/it/logout'){z.object({}).strict().parse(input);await identity.logoutSession(token);res.setHeader('Set-Cookie','eb_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');json(200,{signedOut:true});return true;}
  if(req.method==='GET'&&match&&match[2]==='revisions'){json(200,await service.revisions(actor,match[1]));return true;}
  if(req.method==='GET'&&match&&match[2]==='read'){json(200,await service.readPage(actor,match[1],url.searchParams.get('cursor')??undefined));return true;}
  if(req.method==='GET'&&match&&match[2]==='schedule'){json(200,await new SynchronizationScheduler(db,service).status(actor,match[1]));return true;}
  if(req.method==='GET'&&match&&match[2]==='projection'){const version=z.coerce.number().int().positive().parse(url.searchParams.get('expectedVersion'));json(200,await new SynchronizationService(service).view(actor,match[1],version));return true;}
  if(req.method==='POST'&&url.pathname==='/v1/it/grants'){json(201,await service.grant(actor,input));return true;}
  if(req.method==='POST'&&revoke){z.object({}).strict().parse(input);json(200,await service.revoke(actor,revoke[1]));return true;}
  if(req.method==='POST'&&match&&match[2]==='confirm'){const q=z.object({expectedVersion:z.number().int().positive(),confirmation:z.unknown()}).strict().parse(input);json(200,await service.confirm(actor,match[1],q.expectedVersion,q.confirmation));return true;}
  if(req.method==='POST'&&match&&match[2]==='sync'){const q=z.object({expectedVersion:z.number().int().positive(),reset:z.boolean().default(false)}).strict().parse(input);json(200,await new SynchronizationService(service).sync(actor,match[1],q.expectedVersion,q.reset));return true;}
  if(req.method==='POST'&&match&&match[2]==='schedule'){const q=z.object({expectedVersion:z.number().int().positive(),expectedScheduleVersion:z.number().int().nonnegative(),enabled:z.boolean(),intervalSeconds:z.number().int().min(10).max(3600).default(60)}).strict().parse(input);const {expectedVersion,...config}=q;json(200,await new SynchronizationScheduler(db,service).configure(actor,match[1],expectedVersion,config));return true;}
  if(req.method==='POST'&&match&&!match[2]){const q=z.object({grantId:z.uuid()}).strict().parse(input);json(201,await service.request(actor,match[1],q.grantId));return true;}
  if(req.method==='POST'&&match&&['diagnose','test'].includes(match[2])){const q=z.object({expectedVersion:z.number().int().positive(),mapping:z.unknown().optional()}).strict().parse(input);if(match[2]==='diagnose'&&q.mapping!==undefined)throw Error('invalid_input');json(200,match[2]==='diagnose'?await service.diagnose(actor,match[1],q.expectedVersion):await service.test(actor,match[1],q.expectedVersion,q.mapping));return true;}
  json(404,{code:'not_found'});
 }catch(e){const code=e instanceof Error?e.message:'connector_unavailable';const allowed=['not_authorized','not_found','target_not_authorized','needs_authorization','confirmation_required','process_review_required','sync_reset_required','sync_initialization_required','schedule_conflict','schedule_stale','sync_conflict','sync_batch_limit','invalid_change_batch','sync_incomplete','connector_not_active','version_conflict','invalid_transition','invalid_target','invalid_grant_expiry','rate_limited','unsupported','metadata_changed','cursor_stale','invalid_cursor','input_limit'];json(e instanceof z.ZodError?422:e instanceof SyntaxError?400:code==='input_limit'?413:code==='rate_limited'?429:['not_authorized','needs_authorization','target_not_authorized','confirmation_required','process_review_required'].includes(code)?403:code==='not_found'?404:['version_conflict','metadata_changed','cursor_stale','sync_conflict','sync_reset_required','schedule_conflict','schedule_stale'].includes(code)?409:allowed.includes(code)?422:503,{code:e instanceof z.ZodError?'invalid_input':e instanceof SyntaxError?'invalid_json':allowed.includes(code)?code:'connector_unavailable'});}
 return true;
}
