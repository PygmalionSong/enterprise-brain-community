// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Independent constructed warehouse source; mutations affect this source only.
// 独立构造仓储源，动作只改变此合成源。
import {createServer} from 'node:http';
import {z} from 'zod';
import {commandSchema,hash,type Receipt} from '../runtime/contracts.ts';
import type {Database} from '../db/adapter.ts';
import {createOperatingSource} from './operating-source.ts';
import {warehouseProcesses} from './process-catalogs.ts';
export async function createSyntheticSource(db:Database,secret:string,skus:any[],autoWorkflow=false){
 const operating=await createOperatingSource(db,autoWorkflow);
 await db.exec(`CREATE TABLE IF NOT EXISTS source_resource(origin text NOT NULL,sku text NOT NULL,available bigint NOT NULL CHECK(available>=0),version integer NOT NULL,qualified boolean NOT NULL,PRIMARY KEY(origin,sku));CREATE TABLE IF NOT EXISTS source_request(reference text PRIMARY KEY,args_hash text NOT NULL,receipt jsonb NOT NULL);CREATE TABLE IF NOT EXISTS source_config(key text PRIMARY KEY,value text NOT NULL);`);
 await db.exec('CREATE TABLE IF NOT EXISTS source_process_metadata(id text PRIMARY KEY,definition jsonb NOT NULL)');await db.query('INSERT INTO source_process_metadata VALUES($1,$2) ON CONFLICT DO NOTHING',['warehouse',JSON.stringify(warehouseProcesses)]);
 for(const s of skus)for(const origin of ['own','transfer','copack'])await db.query('INSERT INTO source_resource VALUES($1,$2,$3,1,true) ON CONFLICT DO NOTHING',[origin,s.id,s.allocation[origin]*10000]);
 const fault={delayAfterCommitMs:0,rejectLookup:false,atomicGuard:true};
 async function lookup(reference:string){return (await db.query('SELECT receipt FROM source_request WHERE reference=$1',[reference])).rows[0]?.receipt as Receipt|undefined;}
 async function submit(reference:string,raw:unknown){const c=commandSchema.parse(raw),fingerprint=hash(c);return db.transaction(async tx=>{
  // Serialize on source rows, including changes made outside this product.
  // 在源行上序列化，也覆盖本产品之外的修改。
  const resources=(await tx.query('SELECT * FROM source_resource WHERE origin=$1 ORDER BY sku FOR UPDATE',[c.origin])).rows;
  const prior=(await tx.query('SELECT args_hash,receipt FROM source_request WHERE reference=$1',[reference])).rows[0];if(prior){if(prior.args_hash!==fingerprint)throw Error('idempotency_conflict');return prior.receipt as Receipt;}
  if(new Set(c.lines.map(l=>l.sku)).size!==c.lines.length)throw Error('duplicate_sku');
  for(const l of c.lines){const r=resources.find(x=>x.sku===l.sku);if(!r||Number(r.version)!==c.expectedVersion||!r.qualified||Number(r.available)<l.quantity)throw Error('resource_conflict');}
  if(!fault.atomicGuard)throw Error('no_atomic_guard');
  for(const l of c.lines)await tx.query('UPDATE source_resource SET available=available-$3,version=version+1 WHERE origin=$1 AND sku=$2',[c.origin,l.sku,l.quantity]);
  const receipt:Receipt={reference,externalRef:'REQ-'+reference,sourceVersion:1,state:'accepted',lines:c.lines,origin:c.origin};
  await tx.query('INSERT INTO source_request VALUES($1,$2,$3)',[reference,fingerprint,JSON.stringify(receipt)]);return receipt;
 });}
 async function fulfill(reference:string){return db.transaction(async tx=>{const r=(await tx.query('SELECT receipt FROM source_request WHERE reference=$1 FOR UPDATE',[reference])).rows[0];if(!r)throw Error('not_found');const receipt=r.receipt as Receipt;if(receipt.state==='received')return receipt;receipt.state='received';receipt.sourceVersion++;await tx.query('UPDATE source_request SET receipt=$2 WHERE reference=$1',[reference,JSON.stringify(receipt)]);return receipt;});}
 const server=createServer(async(req,res)=>{
  const reply=(status:number,body:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  if(req.headers.authorization!=='Bearer '+secret){reply(403,{code:'not_authorized',commit_state:'not_committed'});return;}
  try{
   const u=new URL(req.url??'/','http://127.0.0.1');
   if(req.method==='GET'&&u.pathname==='/metadata'){const keys=(await db.query('SELECT origin,sku FROM source_resource ORDER BY origin,sku')).rows,processMetadata=(await db.query("SELECT definition FROM source_process_metadata WHERE id='warehouse'")).rows[0]?.definition;reply(200,{version:1,atomicGuard:fault.atomicGuard,lookupComplete:true,idempotencyRetentionSeconds:86400,resourceKeys:keys.map(r=>r.origin+'/'+r.sku),processMetadata});return;}
   if(req.method==='GET'&&u.pathname==='/operating-evidence'){reply(200,operating.evidence(JSON.parse(u.searchParams.get('selection')??'null')));return;}
   if(req.method==='GET'&&u.pathname.startsWith('/operating-requests/')){const r=await operating.lookup(u.pathname.slice('/operating-requests/'.length));reply(r?200:404,r??{code:'not_found'});return;}
   if(req.method==='GET'&&u.pathname==='/snapshot'){const rows=(await db.query('SELECT * FROM source_resource ORDER BY origin,sku')).rows;reply(200,{version:1,atomicGuard:fault.atomicGuard,lookupComplete:true,idempotencyRetentionSeconds:86400,resources:rows.map(r=>({...r,available:Number(r.available),version:Number(r.version),proof:{reference:`FIXTURE-${r.origin}-${r.sku}-v${r.version}`,availableBy:'2026-10-15',expiresOn:'2027-04-01',releaseRequired:true}}))});return;}
   if(req.method==='GET'&&u.pathname.startsWith('/requests/')){if(fault.rejectLookup){reply(503,{code:'lookup_unavailable'});return;}const r=await lookup(decodeURIComponent(u.pathname.slice(10)));reply(r?200:404,r??{code:'not_found'});return;}
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>32768)throw Error('body_limit');}
   const input=JSON.parse(body);
   if(req.method==='POST'&&u.pathname==='/operating-requests'){const {reference,command}=z.object({reference:z.uuid(),command:z.unknown()}).strict().parse(input);reply(202,await operating.submit(reference,command));return;}
   if(req.method==='POST'&&u.pathname==='/_demo/operating-fulfill'){const {reference}=z.object({reference:z.uuid()}).strict().parse(input);reply(200,await operating.fulfill(reference));return;}
   if(req.method==='POST'&&u.pathname==='/requests'){const {reference,command}=z.object({reference:z.string().uuid(),command:commandSchema}).strict().parse(input),r=await submit(reference,command);if(fault.delayAfterCommitMs)await new Promise(resolve=>setTimeout(resolve,fault.delayAfterCommitMs));reply(202,r);return;}
   if(req.method==='POST'&&u.pathname==='/_demo/fulfill'){const {reference}=z.object({reference:z.string().uuid()}).strict().parse(input);reply(200,await fulfill(reference));return;}
   reply(404,{code:'not_found'});
  }catch(e){const code=e instanceof Error?e.message:'failed';reply(409,{code:['resource_conflict','idempotency_conflict','no_atomic_guard','not_found'].includes(code)?code:'invalid_command',commit_state:'not_committed'});}
 });
 return {server,fault,submit,lookup,fulfill,operating,externalChange:async(origin:string,sku:string)=>db.query('UPDATE source_resource SET available=0,version=version+1 WHERE origin=$1 AND sku=$2',[origin,sku])};
}
