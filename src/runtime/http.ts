// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Demo runtime API: explicit schemas, session/CSRF, no arbitrary tools or targets.
// Demo运行接口：严格schema、会话/CSRF，不接收任意工具或目标。
import type {IncomingMessage,ServerResponse} from 'node:http';
import {z} from 'zod';
import type {Actor,IdentityService} from '../identity/service.ts';
import type {RuntimeService} from './service.ts';
import {goalSchema} from './contracts.ts';
export async function runtimeRoute(req:IncomingMessage,res:ServerResponse,url:URL,actor:Actor,identity:IdentityService,token:string,runtime:RuntimeService){
 const json=(status:number,body:unknown)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 if(!/^\/v1\/(runs|plans|cases|dev\/runtime)/.test(url.pathname))return false;
 if(req.method!=='GET'&&req.method!=='POST'){json(405,{code:'method_not_allowed'});return true;}
 if(req.method==='POST'&&!await identity.validateCsrf(token,String(req.headers['x-csrf-token']??''),String(req.headers.origin??''),url.origin)){json(403,{code:'request_not_authorized',business_message_key:'denied'});return true;}
 try{
  let input:unknown={};if(req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>32768)throw Error('input_limit');}input=JSON.parse(body);}
  const run=/^\/v1\/runs\/([a-f0-9-]{36})(?:\/(events|pause|resume|cancel|reconcile))?$/.exec(url.pathname);
  const create=/^\/v1\/cases\/([\w-]+)\/runs$/.exec(url.pathname),approval=/^\/v1\/plans\/([a-f0-9-]{36})\/approvals$/.exec(url.pathname),fulfill=/^\/v1\/dev\/runtime\/([a-f0-9-]{36})\/fulfill$/.exec(url.pathname);
  if(req.method==='GET'&&run){if(run[2]&&run[2]!=='events'){json(405,{code:'method_not_allowed'});return true;}json(200,run[2]==='events'?await runtime.events(actor,run[1],Number(url.searchParams.get('after_sequence')??0)):!run[2]?await runtime.get(actor,run[1]):{code:'not_found'});return true;}
  if(req.method==='POST'&&create){const goal=goalSchema.parse(input);json(202,await runtime.create(actor,create[1],goal,String(req.headers['idempotency-key']??'')));return true;}
  if(req.method==='POST'&&approval){const q=z.object({expected_version:z.number().int().positive(),decision:z.enum(['approve','reject'])}).strict().parse(input);json(200,await runtime.approve(actor,approval[1],q.expected_version,q.decision));return true;}
  if(req.method==='POST'&&run&&run[2]==='reconcile'){z.object({}).strict().parse(input);await runtime.get(actor,run[1]);await runtime.reconcile(actor.enterpriseId,run[1],true);json(200,await runtime.get(actor,run[1]));return true;}
  if(req.method==='POST'&&run&&['pause','resume','cancel'].includes(run[2])){const q=z.object({expected_version:z.number().int().positive(),reason:z.string().min(1).max(300)}).strict().parse(input);json(200,await runtime.control(actor,run[1],q.expected_version,run[2] as 'pause'|'resume'|'cancel',q.reason));return true;}
  if(req.method==='POST'&&fulfill){z.object({}).strict().parse(input);json(202,await runtime.fulfillDemo(actor,fulfill[1]));return true;}
  json(404,{code:'not_found'});return true;
 }catch(e){const code=e instanceof Error?e.message:'runtime_failure',known=['not_found','not_authorized','idempotency_conflict','version_conflict','approval_stale','resource_budget_conflict','invalid_transition','invalid_cursor','invalid_idempotency_key','unsupported_case_context','input_limit'];json(code==='input_limit'?413:e instanceof SyntaxError?400:code==='not_found'?404:code==='not_authorized'?403:['idempotency_conflict','version_conflict','approval_stale','resource_budget_conflict'].includes(code)?409:e instanceof z.ZodError?422:known.includes(code)?422:500,{code:e instanceof SyntaxError?'invalid_json':known.includes(code)?code:e instanceof z.ZodError?'invalid_input':'runtime_unavailable',business_message_key:code==='not_authorized'?'denied':'failed',retryable:false});return true;}
}
