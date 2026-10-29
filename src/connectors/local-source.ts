// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Explicit loopback capability, no discovery, redirects or arbitrary SQL tools.
// 显式本机能力，不自动发现/重定向，也不向模型开放任意SQL。
import {sourceSchema,receiptSchema,commandSchema,type Command,type Receipt,type SourceSnapshot} from '../runtime/contracts.ts';
import type {Database} from '../db/adapter.ts';
import {localFetch} from '../../scripts/local-http.mjs';
import {selectionSchema,evidenceSchema,workSchema,workReceiptSchema,type Selection,type WorkCommand} from '../runtime/operating-contracts.ts';
import {z} from 'zod';
import {processCatalogSchema} from './process-metadata.ts';
const bindingSchema=z.object({httpAssetId:z.string().regex(/^CON-\d{2}$/).default('CON-01'),sqlAssetId:z.string().regex(/^CON-\d{2}$/).default('CON-02')}).strict().refine(v=>v.httpAssetId!==v.sqlAssetId,{message:'ambiguous_connector_binding'});
export class SourceError extends Error {notCommitted:boolean;constructor(code:string,notCommitted=false){super(code);this.notCommitted=notCommitted;}}
export class LocalSource {
 private base:string;private secret:string;private sql:Database;private timeout:number;private gate?: (id:string,operation:'read'|'write')=>Promise<void>;private bindings:z.infer<typeof bindingSchema>;
 constructor(base:string,secret:string,sql:Database,timeout=1500,gate?:(id:string,operation:'read'|'write')=>Promise<void>,bindings:Partial<z.infer<typeof bindingSchema>>={}){const u=new URL(base);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('target_not_authorized');this.base=u.origin;this.secret=secret;this.sql=sql;this.timeout=timeout;this.gate=gate;this.bindings=bindingSchema.parse(bindings);}
 get endpoint(){return this.base;}
 async metadata(){return z.object({version:z.number().int().positive(),atomicGuard:z.boolean(),lookupComplete:z.boolean(),idempotencyRetentionSeconds:z.number().int().nonnegative(),resourceKeys:z.array(z.string()).max(128),processMetadata:processCatalogSchema}).strict().parse(await this.call('/metadata'));}
 private async call(path:string,body?:unknown){
  let r:Response;try{r=await localFetch(this.base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+this.secret,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(this.timeout)});}catch{throw new SourceError('source_result_unknown');}
  if(r.status>=300&&r.status<400){await r.body?.cancel();throw new SourceError('source_redirect_denied');}
  const chunks:Uint8Array[]=[];let size=0;for await(const chunk of r.body??[]){size+=chunk.length;if(size>32768)throw new SourceError('source_response_limit');chunks.push(chunk);}const text=Buffer.concat(chunks).toString('utf8');
  const data=JSON.parse(text);if(r.status===404&&data.code==='not_found'&&(path.startsWith('/requests/')||path.startsWith('/operating-requests/')))return null;
  if(!r.ok)throw new SourceError(r.status===409?'source_conflict':r.status===403?'source_access_denied':'source_unavailable',data.commit_state==='not_committed');return data;
 }
 async snapshot():Promise<SourceSnapshot>{await this.gate?.(this.bindings.httpAssetId,'read');return sourceSchema.parse(await this.call('/snapshot'));}
 async submit(reference:string,command:Command):Promise<Receipt>{try{await this.gate?.(this.bindings.httpAssetId,'write');}catch{throw new SourceError('connector_not_active',true);}return receiptSchema.parse(await this.call('/requests',{reference,command:commandSchema.parse(command)}));}
 async lookup(reference:string):Promise<Receipt|null>{await this.gate?.(this.bindings.httpAssetId,'read');const r=await this.call('/requests/'+encodeURIComponent(reference));return r?receiptSchema.parse(r):null;}
 async fulfill(reference:string){await this.gate?.(this.bindings.httpAssetId,'write');return this.call('/_demo/fulfill',{reference});}
 async operatingEvidence(selection:Selection){await this.gate?.(this.bindings.httpAssetId,'read');return evidenceSchema.parse(await this.call('/operating-evidence?selection='+encodeURIComponent(JSON.stringify(selectionSchema.parse(selection)))));}
 async submitOperating(reference:string,command:WorkCommand){try{await this.gate?.(this.bindings.httpAssetId,'write');}catch{throw new SourceError('connector_not_active',true);}return workReceiptSchema.parse(await this.call('/operating-requests',{reference,command:workSchema.parse(command)}));}
 async lookupOperating(reference:string){await this.gate?.(this.bindings.httpAssetId,'read');const r=await this.call('/operating-requests/'+encodeURIComponent(reference));return r?workReceiptSchema.parse(r):null;}
 async finance(enterprise:string){await this.gate?.(this.bindings.sqlAssetId,'read');return this.sql.transaction(async tx=>{await tx.exec('SET LOCAL ROLE source_reader');const r=await tx.query('SELECT version,available_cash_cny FROM finance_snapshot WHERE enterprise_id=$1',[enterprise]);if(r.rows.length!==1)throw Error('finance_evidence_missing');return {version:Number(r.rows[0].version),availableCashCny:Number(r.rows[0].available_cash_cny)};});}
}
export async function initializeFinance(db:Database,enterprise:string){
 await db.exec(`CREATE TABLE IF NOT EXISTS finance_snapshot(enterprise_id uuid PRIMARY KEY,version integer NOT NULL,available_cash_cny bigint NOT NULL);DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='source_reader') THEN CREATE ROLE source_reader NOLOGIN NOSUPERUSER NOBYPASSRLS;END IF;END $$;GRANT SELECT ON finance_snapshot TO source_reader;`);
 await db.query('INSERT INTO finance_snapshot VALUES($1,1,60000000) ON CONFLICT DO NOTHING',[enterprise]);
}
