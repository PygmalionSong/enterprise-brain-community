// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Authenticated grant lifecycle, separate from discovery and business execution.
// 认证后的读取授权生命周期，与发现及业务执行分开。
import type {IncomingMessage,ServerResponse} from 'node:http';import {z} from 'zod';
import type {Actor,IdentityService} from '../identity/service.ts';import {BusinessReadGrants} from './business-read-grants.ts';import {readBody} from './http.ts';
export async function businessReadRoute(req:IncomingMessage,res:ServerResponse,url:URL,actor:Actor,identity:IdentityService,token:string,origin:string,grants:BusinessReadGrants){
 const prefix='/v1/business-read';if(!url.pathname.startsWith(prefix+'/'))return false;
 const reply=(status:number,data:unknown)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 try{
  if(!['it','executive','operations'].includes(actor.role))throw Error('not_authorized');
  if(!['GET','POST'].includes(req.method??'')||url.search)throw Error('invalid_input');
  if(req.method==='POST'&&!await identity.validateCsrf(token,String(req.headers['x-csrf-token']??''),String(req.headers.origin??''),origin))throw Error('not_authorized');
  const path=url.pathname.slice(prefix.length),policy=/^\/policies\/([a-f0-9-]{36})(?:\/(approve))?$/.exec(path),revoke=/^\/grants\/([a-f0-9-]{36})\/revoke$/.exec(path),input=req.method==='POST'?await readBody(req):undefined;
  if(path==='/policies'&&req.method==='GET'){reply(200,await grants.policies(actor));return true;}
  if(path==='/policies'&&req.method==='POST'){reply(201,await grants.reviewPolicyFromSource(actor,input));return true;}
  if(policy&&req.method==='GET'&&!policy[2]){reply(200,await grants.describePolicy(actor,policy[1]));return true;}
  if(policy&&req.method==='POST'&&policy[2]==='approve'){reply(201,await grants.approve(actor,policy[1],input));return true;}
  if(revoke&&req.method==='POST'){const q=z.object({expectedVersion:z.number().int().positive()}).strict().parse(input);reply(200,await grants.revoke(actor,revoke[1],q.expectedVersion));return true;}
  reply(404,{code:'not_found'});
 }catch(error){const code=error instanceof z.ZodError?'invalid_input':error instanceof Error?error.message:'unavailable';const status=code==='not_authorized'?403:code==='not_found'?404:code==='input_limit'?413:code==='json_required'?415:code==='invalid_input'||code==='invalid_json'?422:code.startsWith('business_read_')?409:503;reply(status,{code:status===503?'business_read_unavailable':code});}
 return true;
}
