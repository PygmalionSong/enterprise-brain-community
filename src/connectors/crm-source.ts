// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Owned CRM source fixture and fixed read-only adapter; no arbitrary SQL or vendor claim.
// 自有CRM源夹具与固定只读适配器，不开放任意SQL、不冒充厂商接入。
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import type {Database,Sql} from '../db/adapter.ts';
import {hash} from '../runtime/contracts.ts';
import {targetSchema,type ConnectorDriver,type Description,type Mapping,type Target} from './discovery.ts';
import {changeBatchSchema,type ChangeBatch} from './change-contract.ts';
import {processCatalogSchema} from './process-metadata.ts';
import {crmProcesses} from '../demo/process-catalogs.ts';
const optionsSchema=z.object({enterpriseId:z.uuid(),assetId:z.string().default('CON-02'),asOf:z.iso.datetime().default('2026-10-12T04:00:00Z')}).strict();
const rowSchema=z.object({source_key:z.string(),customer_code:z.string(),party_type:z.enum(['B2B','B2C']),segment:z.string(),marketing_consent:z.boolean(),consent_version:z.number().int().positive().nullable(),order_code:z.string().nullable(),channel:z.string().nullable(),quantity_cases:z.string().regex(/^\d+$/).nullable(),net_amount_cny:z.string().regex(/^\d+(\.\d+)?$/).nullable(),order_state:z.enum(['confirmed','cancelled']).nullable()}).strict();
const cursorSchema=z.object({enterprise:z.uuid(),asset:z.string(),source:z.uuid(),asOf:z.iso.datetime(),version:z.number().int().positive(),offset:z.number().int().nonnegative()}).strict();
const checkpointSchema=cursorSchema.omit({offset:true});
export async function initializeCrmFixture(db:Database,enterprise:string){
 z.uuid().parse(enterprise);
 await db.exec(`
 CREATE TABLE IF NOT EXISTS crm_fixture_version(enterprise_id uuid PRIMARY KEY,version bigint NOT NULL DEFAULT 1,source_id uuid NOT NULL,change_floor bigint NOT NULL DEFAULT 1);
 DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='crm_fixture_version' AND column_name='change_floor') THEN ALTER TABLE crm_fixture_version ADD COLUMN change_floor bigint NOT NULL DEFAULT 1;UPDATE crm_fixture_version SET change_floor=version;END IF;END $$;
 CREATE TABLE IF NOT EXISTS crm_fixture_change(enterprise_id uuid NOT NULL,version bigint NOT NULL,customer_code text NOT NULL,PRIMARY KEY(enterprise_id,version,customer_code));
 CREATE TABLE IF NOT EXISTS crm_fixture_process_metadata(enterprise_id uuid PRIMARY KEY,definition jsonb NOT NULL);
 CREATE TABLE IF NOT EXISTS crm_fixture_customer(enterprise_id uuid NOT NULL,customer_code text NOT NULL,party_type text NOT NULL CHECK(party_type IN ('B2B','B2C')),segment text NOT NULL,PRIMARY KEY(enterprise_id,customer_code));
 CREATE TABLE IF NOT EXISTS crm_fixture_consent(enterprise_id uuid NOT NULL,customer_code text NOT NULL,version integer NOT NULL CHECK(version>0),granted boolean NOT NULL,expires_at timestamptz,PRIMARY KEY(enterprise_id,customer_code),FOREIGN KEY(enterprise_id,customer_code) REFERENCES crm_fixture_customer);
 CREATE TABLE IF NOT EXISTS crm_fixture_order(enterprise_id uuid NOT NULL,order_code text NOT NULL,customer_code text NOT NULL,channel text NOT NULL,quantity_cases bigint NOT NULL CHECK(quantity_cases>=0),net_amount_cny numeric(22,2) NOT NULL CHECK(net_amount_cny>=0),order_state text NOT NULL CHECK(order_state IN ('confirmed','cancelled')),PRIMARY KEY(enterprise_id,order_code),FOREIGN KEY(enterprise_id,customer_code) REFERENCES crm_fixture_customer);
 CREATE OR REPLACE VIEW crm_fixture_read AS SELECT c.enterprise_id,c.customer_code,c.party_type,c.segment,a.version AS consent_version,a.granted,a.expires_at,o.order_code,o.channel,o.quantity_cases,o.net_amount_cny,o.order_state FROM crm_fixture_customer c LEFT JOIN crm_fixture_consent a USING(enterprise_id,customer_code) LEFT JOIN crm_fixture_order o USING(enterprise_id,customer_code);
 CREATE OR REPLACE FUNCTION crm_fixture_touch() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE e uuid;v bigint;BEGIN IF TG_OP='UPDATE' AND NEW.enterprise_id IS DISTINCT FROM OLD.enterprise_id THEN RAISE EXCEPTION 'source_identity_immutable';END IF;e=COALESCE(NEW.enterprise_id,OLD.enterprise_id);UPDATE crm_fixture_version SET version=version+1 WHERE enterprise_id=e RETURNING version INTO v;IF v IS NULL THEN RAISE EXCEPTION 'source_identity_missing';END IF;IF TG_OP<>'DELETE' THEN INSERT INTO crm_fixture_change VALUES(e,v,NEW.customer_code) ON CONFLICT DO NOTHING;END IF;IF TG_OP<>'INSERT' THEN INSERT INTO crm_fixture_change VALUES(e,v,OLD.customer_code) ON CONFLICT DO NOTHING;END IF;RETURN COALESCE(NEW,OLD);END $$;
 DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['crm_fixture_customer','crm_fixture_consent','crm_fixture_order'] LOOP IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=t||'_version') THEN EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION crm_fixture_touch()',t||'_version',t);END IF;END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='crm_fixture_reader') THEN CREATE ROLE crm_fixture_reader NOLOGIN NOSUPERUSER NOBYPASSRLS;END IF;END $$;
 GRANT SELECT ON crm_fixture_read,crm_fixture_version,crm_fixture_change,crm_fixture_process_metadata TO crm_fixture_reader;
 `);
 await db.transaction(async tx=>{
 await tx.query('INSERT INTO crm_fixture_version(enterprise_id,version,source_id) VALUES($1,1,$2) ON CONFLICT DO NOTHING',[enterprise,randomUUID()]);
 await tx.query('INSERT INTO crm_fixture_process_metadata VALUES($1,$2) ON CONFLICT DO NOTHING',[enterprise,JSON.stringify(crmProcesses)]);
 for(const [customer,type,segment]of [['KA-001','B2B','key_account'],['MEM-001','B2C','repeat_member'],['MEM-002','B2C','new_member']])await tx.query('INSERT INTO crm_fixture_customer VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[enterprise,customer,type,segment]);
 await tx.query("INSERT INTO crm_fixture_consent VALUES($1,'MEM-001',1,true,'2026-10-13T00:00:00Z'),($1,'MEM-002',1,false,NULL) ON CONFLICT DO NOTHING",[enterprise]);
 await tx.query("INSERT INTO crm_fixture_order VALUES($1,'ORDER-KA','KA-001','modern',10000,800000,'confirmed'),($1,'ORDER-M1','MEM-001','ecommerce',2,160,'confirmed'),($1,'ORDER-M2','MEM-002','ecommerce',1,80,'cancelled') ON CONFLICT DO NOTHING",[enterprise]);
 });
}
export class SqlCrmFixtureDriver implements ConnectorDriver {
 target:Target;enterpriseId:string;secretRef='runtime-source/crm-read-only';private db:Database;private asOf:string;
 constructor(db:Database,input:z.input<typeof optionsSchema>){const options=optionsSchema.parse(input);this.db=db;this.enterpriseId=options.enterpriseId;this.asOf=options.asOf;this.target=targetSchema.parse({assetId:options.assetId,endpoint:'sql://local/crm-read-only',protocol:'sql',port:0});}
 private mapping():Mapping{return {version:'crm-customer-consent-order-v1',keys:['customer_code','order_code'],quantityUnit:'sales_case',currency:'CNY',timezone:'Asia/Shanghai',cardinality:'unique'};}
 private read<T>(fn:(tx:Sql)=>Promise<T>){return this.db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE crm_fixture_reader');return fn(tx);});}
 async describeCapabilities():Promise<Description>{return this.read(async tx=>{const fields=(await tx.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_fixture_read' ORDER BY column_name")).rows,processMetadata=processCatalogSchema.parse((await tx.query('SELECT definition FROM crm_fixture_process_metadata WHERE enterprise_id=$1',[this.enterpriseId])).rows[0]?.definition);const sourceId=z.uuid().parse((await tx.query('SELECT source_id FROM crm_fixture_version WHERE enterprise_id=$1',[this.enterpriseId])).rows[0]?.source_id);return {driverVersion:'owned-sql-crm-fixture-3',schema:{view:'crm_fixture_read',sourceId,fields,asOf:this.asOf,processMetadata},capabilities:{read:true,write:false,incremental:true,atomicGuard:false,lookupComplete:false,retentionSeconds:0},mapping:this.mapping()};});}
 discoverMetadata(){return this.describeCapabilities();}
 async validateMapping(input:unknown){const schema=z.object({version:z.string(),keys:z.array(z.string()),quantityUnit:z.string(),currency:z.string().nullable(),timezone:z.string(),cardinality:z.literal('unique')}).strict(),m=schema.safeParse(input);if(!m.success||hash(m.data)!==hash(this.mapping()))return false;const page=await this.readPage();return page.rows.length>0;}
 async readPage(cursor?:string){
 let offset=0,expected:number|undefined,expectedSource:string|undefined;if(cursor){if(cursor.length>512||!/^[A-Za-z0-9_-]+$/.test(cursor))throw Error('invalid_cursor');let value;try{value=cursorSchema.parse(JSON.parse(Buffer.from(cursor,'base64url').toString()));}catch{throw Error('invalid_cursor');}if(value.enterprise!==this.enterpriseId||value.asset!==this.target.assetId||value.asOf!==this.asOf)throw Error('invalid_cursor');offset=value.offset;expected=value.version;expectedSource=value.source;}
 return this.read(async tx=>{
 const head=(await tx.query('SELECT version,source_id FROM crm_fixture_version WHERE enterprise_id=$1',[this.enterpriseId])).rows[0],version=Number(head?.version),sourceId=String(head?.source_id);if(!Number.isSafeInteger(version)||version<1)throw Error('source_unavailable');if(expectedSource!==undefined&&expectedSource!==sourceId)throw Error('invalid_cursor');if(expected!==undefined&&expected!==version)throw Error('cursor_stale');
 const count=Number((await tx.query('SELECT count(*) n FROM crm_fixture_read WHERE enterprise_id=$1',[this.enterpriseId])).rows[0].n);if(cursor&&offset>=count)throw Error('invalid_cursor');
 const rows=(await tx.query(`SELECT customer_code,party_type,segment,COALESCE(granted AND (expires_at IS NULL OR expires_at>$2),false) AS marketing_consent,consent_version,order_code,channel,quantity_cases::text,net_amount_cny::text,order_state FROM crm_fixture_read WHERE enterprise_id=$1 ORDER BY customer_code,order_code NULLS FIRST LIMIT 2 OFFSET $3`,[this.enterpriseId,this.asOf,offset])).rows.map(row=>rowSchema.parse({...row,source_key:JSON.stringify([row.customer_code,row.order_code])}));
 // Detect changes between metadata and page on read-committed native databases too.
 // 原生数据库读已提交时，元数据与页面之间有更新也拒绝旧游标。
 const final=(await tx.query('SELECT version,source_id FROM crm_fixture_version WHERE enterprise_id=$1',[this.enterpriseId])).rows[0];if(Number(final?.version)!==version||final?.source_id!==sourceId)throw Error('cursor_stale');
 return {rows,context:{sourceId,sourceVersion:version,asOf:this.asOf,factKind:'constructed_actual',currency:'CNY',quantityUnit:'sales_case'},nextCursor:offset+rows.length<count?Buffer.from(JSON.stringify({enterprise:this.enterpriseId,asset:this.target.assetId,source:sourceId,asOf:this.asOf,version,offset:offset+rows.length})).toString('base64url'):null};
 });
 }
 async readChanges(checkpoint?:string):Promise<ChangeBatch>{
  let prior:z.infer<typeof checkpointSchema>|undefined;if(checkpoint){if(checkpoint.length>1024||!/^[A-Za-z0-9_-]+$/.test(checkpoint))throw Error('invalid_cursor');try{prior=checkpointSchema.parse(JSON.parse(Buffer.from(checkpoint,'base64url').toString()));}catch{throw Error('invalid_cursor');}if(prior.enterprise!==this.enterpriseId||prior.asset!==this.target.assetId||prior.asOf!==this.asOf)throw Error('invalid_cursor');}
  return this.read(async tx=>{
   const head=(await tx.query('SELECT version,source_id,change_floor FROM crm_fixture_version WHERE enterprise_id=$1',[this.enterpriseId])).rows[0],version=Number(head?.version),sourceId=String(head?.source_id);if(!Number.isSafeInteger(version)||version<1)throw Error('source_unavailable');if(prior&&prior.source!==sourceId)throw Error('invalid_cursor');if(prior&&(prior.version<Number(head.change_floor)||prior.version>version))throw Error('cursor_stale');
   const keys=(prior?await tx.query('SELECT DISTINCT customer_code FROM crm_fixture_change WHERE enterprise_id=$1 AND version>$2 AND version<=$3 ORDER BY customer_code LIMIT 129',[this.enterpriseId,prior.version,version]):await tx.query('SELECT DISTINCT customer_code FROM crm_fixture_read WHERE enterprise_id=$1 ORDER BY customer_code LIMIT 129',[this.enterpriseId])).rows.map(r=>String(r.customer_code));if(keys.length>128)throw Error('sync_batch_limit');
   const rows=keys.length?(await tx.query(`SELECT customer_code,party_type,segment,COALESCE(granted AND (expires_at IS NULL OR expires_at>$2),false) AS marketing_consent,consent_version,order_code,channel,quantity_cases::text,net_amount_cny::text,order_state FROM crm_fixture_read WHERE enterprise_id=$1 AND customer_code=ANY($3::text[]) ORDER BY customer_code,order_code NULLS FIRST LIMIT 129`,[this.enterpriseId,this.asOf,keys])).rows.map(row=>rowSchema.parse({...row,source_key:JSON.stringify([row.customer_code,row.order_code])})):[];if(rows.length>128)throw Error('sync_batch_limit');
   const final=(await tx.query('SELECT version,source_id FROM crm_fixture_version WHERE enterprise_id=$1',[this.enterpriseId])).rows[0];if(Number(final?.version)!==version||final?.source_id!==sourceId)throw Error('cursor_stale');
   return changeBatchSchema.parse({sourceId,sourceVersion:version,asOf:this.asOf,complete:!prior,checkpoint:Buffer.from(JSON.stringify({enterprise:this.enterpriseId,asset:this.target.assetId,source:sourceId,asOf:this.asOf,version})).toString('base64url'),changes:keys.map(key=>({key,rows:rows.filter(r=>r.customer_code===key)}))});
  });
 }
 async validateAction():Promise<never>{throw Error('unsupported');}
 async executeAction():Promise<never>{throw Error('unsupported');}
 async readActionResult():Promise<never>{throw Error('unsupported');}
 async health(){try{return await this.read(async tx=>{const role=(await tx.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];if(!role||role.rolsuper||role.rolbypassrls)return false;const view=(await tx.query("SELECT has_table_privilege(current_user,'crm_fixture_read','SELECT') allowed")).rows[0];if(!view.allowed)return false;for(const t of ['crm_fixture_customer','crm_fixture_consent','crm_fixture_order']){const rights=(await tx.query("SELECT has_table_privilege(current_user,$1,'SELECT') r,has_table_privilege(current_user,$1,'INSERT,UPDATE,DELETE') w",[t])).rows[0];if(rights.r||rights.w)return false;}return (await tx.query('SELECT version FROM crm_fixture_version WHERE enterprise_id=$1',[this.enterpriseId])).rows.length===1;});}catch{return false;}}
 async testSandbox(){return {verified:false,checks:['crm-view-read-only','business-write-unsupported']};}
}
