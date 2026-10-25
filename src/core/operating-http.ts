// Executive workflows; errors expose business states rather than infrastructure details.
// 老板流程接口；错误反馈经营状态，不暴露基础设施细节。
import type {IncomingMessage,ServerResponse} from 'node:http';
import {z} from 'zod';
import type {Actor,IdentityService} from '../identity/service.ts';
import type {Database} from '../db/adapter.ts';
import type {OperatingService} from './operating-service.ts';
import {operatingSnapshotBody,operatingAggregate} from './workbench.ts';
export async function operatingRoute(req:IncomingMessage,res:ServerResponse,url:URL,a:Actor,identity:IdentityService,token:string,db:Database,service:OperatingService){
 if(!url.pathname.startsWith('/v1/operating/'))return false;const json=(status:number,body:unknown)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 if(!['GET','POST'].includes(req.method??'')){json(405,{code:'method_not_allowed'});return true;}if(req.method==='POST'&&!await identity.validateCsrf(token,String(req.headers['x-csrf-token']??''),String(req.headers.origin??''),url.origin)){json(403,{code:'not_authorized'});return true;}
 try{let input:unknown={};if(req.method==='POST'){let body='';for await(const c of req){body+=c;if(Buffer.byteLength(body)>32768)throw Error('input_limit');}input=JSON.parse(body);}const match=/^\/v1\/operating\/cases\/([a-f0-9-]{36})(?:\/(approve|reconcile))?$/.exec(url.pathname);
 if(req.method==='GET'&&url.pathname==='/v1/operating/snapshot'){const body=await operatingSnapshotBody(db,a);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(body);return true;}
 if(req.method==='GET'&&url.pathname==='/v1/operating/aggregate'){json(200,await operatingAggregate(db,a,Object.fromEntries(url.searchParams)));return true;}
 if(req.method==='GET'&&url.pathname==='/v1/operating/cases'){json(200,await service.list(a));return true;}
 if(req.method==='POST'&&url.pathname==='/v1/operating/cases'){json(201,await service.create(a,input,String(req.headers['idempotency-key']??'')));return true;}
 if(req.method==='GET'&&match&&!match[2]){json(200,await service.get(a,match[1]));return true;}
 if(req.method==='POST'&&match&&match[2]==='approve'){const q=z.object({expectedVersion:z.number().int().positive()}).strict().parse(input);json(200,await service.approve(a,match[1],q.expectedVersion));return true;}
 if(req.method==='POST'&&match&&match[2]==='reconcile'){z.object({}).strict().parse(input);json(200,await service.reconcile(a,match[1],true));return true;}
 json(404,{code:'not_found'});
 }catch(e){const code=e instanceof Error?e.message:'operating_unavailable';json(e instanceof SyntaxError?400:e instanceof z.ZodError?422:code==='input_limit'?413:code==='invalid_context'?422:['not_authorized','business_access_denied'].includes(code)?403:code==='not_found'?404:['version_conflict','approval_stale','idempotency_conflict'].includes(code)?409:503,{code:['not_authorized','business_access_denied','not_found','version_conflict','approval_stale','idempotency_conflict','invalid_context'].includes(code)?code:e instanceof z.ZodError?'invalid_input':'operating_unavailable'});}
 return true;
}
