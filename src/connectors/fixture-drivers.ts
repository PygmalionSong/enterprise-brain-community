// Explicitly owned constructed targets; reusable contract, not vendor support.
// 明确自有构造目标；共用合同，不冒充厂商适配。
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {DEMO_ENTERPRISE} from '../industry/seed.ts';
import {openDatabase,type Database} from '../db/adapter.ts';
import {LocalSource} from './local-source.ts';
import {createSyntheticSource} from '../demo/source.ts';
import {commandSchema,hash} from '../runtime/contracts.ts';
import {targetSchema,type ConnectorDriver,type Description,type Mapping,type Target} from './discovery.ts';
import {missingProcesses} from './process-metadata.ts';
const bindingSchema=z.object({enterpriseId:z.uuid().optional(),assetId:z.string().optional(),secretRef:z.string().regex(/^[A-Za-z0-9/_-]{1,100}$/).optional()}).strict();
type Binding=z.infer<typeof bindingSchema>;
const mappingSchema=z.object({version:z.string(),keys:z.array(z.string()),quantityUnit:z.string(),currency:z.string().nullable(),timezone:z.string(),cardinality:z.literal('unique')}).strict();
export class HttpFixtureDriver implements ConnectorDriver {
 target:Target;secretRef='runtime-source/http';enterpriseId=DEMO_ENTERPRISE;private source:LocalSource;private skus:any[];private sql:Database;
 constructor(endpoint:string,source:LocalSource,skus:any[],sql:Database,binding:Binding={}){const b=bindingSchema.parse(binding);if(new URL(endpoint).origin!==source.endpoint||new URL(endpoint).pathname!=='/'||new URL(endpoint).search||new URL(endpoint).hash)throw Error('target_not_authorized');this.enterpriseId=b.enterpriseId??DEMO_ENTERPRISE;this.secretRef=b.secretRef??this.secretRef;this.target=targetSchema.parse({assetId:b.assetId??'CON-01',endpoint:source.endpoint,protocol:'http',port:new URL(endpoint).port?Number(new URL(endpoint).port):80});this.source=source;this.skus=skus;this.sql=sql;}
 private mapping():Mapping{return {version:'supply-resources-v1',keys:['origin','sku'],quantityUnit:'sales_case',currency:null,timezone:'Asia/Shanghai',cardinality:'unique'};}
 async describeCapabilities():Promise<Description>{const s=await this.source.metadata();return {driverVersion:'owned-http-fixture-2',schema:{version:s.version,resourceKeys:s.resourceKeys.sort(),processMetadata:s.processMetadata},capabilities:{read:true,write:s.atomicGuard&&s.lookupComplete&&s.idempotencyRetentionSeconds>=3600,incremental:false,atomicGuard:s.atomicGuard,lookupComplete:s.lookupComplete,retentionSeconds:s.idempotencyRetentionSeconds},mapping:this.mapping()};}
 discoverMetadata(){return this.describeCapabilities();}
 async validateMapping(input:unknown){const m=mappingSchema.safeParse(input);if(!m.success||hash(m.data)!==hash(this.mapping()))return false;const s=await this.source.snapshot(),keys=s.resources.map(r=>r.origin+'/'+r.sku),expected=['own','transfer','copack'].flatMap(o=>this.skus.map(s=>o+'/'+s.id));return new Set(keys).size===keys.length&&hash([...keys].sort())===hash(expected.sort());}
 async readPage(cursor?:string){const s=await this.source.snapshot(),fingerprint=hash(s),rows=s.resources.map(r=>({...r,unit:'sales_case',timezone:'Asia/Shanghai'}));let offset=0;if(cursor){if(cursor.length>500)throw Error('invalid_cursor');const q=z.object({offset:z.number().int().nonnegative(),snapshot:z.string()}).strict().parse(JSON.parse(Buffer.from(cursor,'base64url').toString()));if(q.snapshot!==fingerprint||q.offset>=rows.length)throw Error('cursor_stale');offset=q.offset;}const end=offset+4;return {rows:rows.slice(offset,end),nextCursor:end<rows.length?Buffer.from(JSON.stringify({offset:end,snapshot:fingerprint})).toString('base64url'):null};}
 async readChanges():Promise<never>{throw Error('unsupported');}
 async validateAction(action:unknown){const c=commandSchema.parse(action);if(new Set(c.lines.map(l=>l.sku)).size!==c.lines.length||c.lines.some(l=>!this.skus.some(s=>s.id===l.sku)))throw Error('invalid_action');return c;}
 async executeAction(reference:string,action:unknown){return this.source.submit(reference,await this.validateAction(action));}
 readActionResult(reference:string){return this.source.lookup(reference);}
 async health(){try{await this.source.metadata();return true;}catch{return false;}}
 async testSandbox(){
  // Separate ephemeral source: never consumes deployed fixture capacity.
  // 独立临时源：不消耗部署案例的供给容量。
  const warehouse=await openDatabase(':memory:'),secret='isolated-sandbox-only',sandbox=await createSyntheticSource(warehouse,secret,this.skus);
  await new Promise<void>(ok=>sandbox.server.listen(0,'127.0.0.1',ok));const endpoint='http://127.0.0.1:'+(sandbox.server.address() as any).port,client=new LocalSource(endpoint,secret,this.sql),reference=randomUUID();
  try{const s=await client.snapshot(),command={origin:'own' as const,lines:this.skus.map(s=>({sku:s.id,quantity:1})),expectedVersion:s.resources.find(r=>r.origin==='own')!.version};const a=await client.submit(reference,command),b=await client.submit(reference,command),readback=await client.lookup(reference);await client.fulfill(reference);const received=await client.lookup(reference);const count=Number((await warehouse.query('SELECT count(*) n FROM source_request')).rows[0].n);return {verified:hash(a)===hash(b)&&hash(a)===hash(readback)&&received?.state==='received'&&count===1,checks:['isolated-http-write','idempotent-repeat','source-readback','fulfillment-readback','ephemeral-source-closed']};}finally{await new Promise<void>(ok=>sandbox.server.close(()=>ok()));await warehouse.close();}
 }
}
export class SqlFixtureDriver implements ConnectorDriver {
 target:Target={assetId:'CON-02',endpoint:'sql://local/finance',protocol:'sql',port:0};secretRef='runtime-source/sql-reader';enterpriseId:string;private sql:Database;private source:LocalSource;private enterprise:string;
 constructor(sql:Database,source:LocalSource,enterprise:string,binding:Omit<Binding,'enterpriseId'>={}){const b=bindingSchema.omit({enterpriseId:true}).parse(binding);this.sql=sql;this.source=source;this.enterprise=z.uuid().parse(enterprise);this.enterpriseId=this.enterprise;this.secretRef=b.secretRef??this.secretRef;this.target=targetSchema.parse({...this.target,assetId:b.assetId??'CON-02'});}
 async describeCapabilities():Promise<Description>{const fields=await this.sql.transaction(async tx=>{await tx.exec('SET LOCAL ROLE source_reader');return (await tx.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='finance_snapshot' ORDER BY column_name")).rows;});return {driverVersion:'owned-sql-finance-fixture-1',schema:{view:'finance_snapshot',fields,processMetadata:missingProcesses('owned-finance-no-process-definition')},capabilities:{read:true,write:false,incremental:false,atomicGuard:false,lookupComplete:false,retentionSeconds:0},mapping:{version:'finance-cny-v1',keys:['enterprise_id'],quantityUnit:'CNY',currency:'CNY',timezone:'Asia/Shanghai',cardinality:'unique'}};}
 discoverMetadata(){return this.describeCapabilities();}
 async validateMapping(input:unknown){const m=mappingSchema.safeParse(input),d=await this.describeCapabilities();if(!m.success||hash(m.data)!==hash(d.mapping))return false;const f=await this.source.finance(this.enterprise);return Number.isSafeInteger(f.version)&&f.version>0&&Number.isSafeInteger(f.availableCashCny)&&f.availableCashCny>=0;}
 async readPage(cursor?:string){if(cursor)throw Error('unsupported');return {rows:[{enterprise_id:this.enterprise,...await this.source.finance(this.enterprise),currency:'CNY',timezone:'Asia/Shanghai'}],nextCursor:null};}
 async readChanges():Promise<never>{throw Error('unsupported');}
 async validateAction():Promise<never>{throw Error('unsupported');}
 async executeAction():Promise<never>{throw Error('unsupported');}
 async readActionResult():Promise<never>{throw Error('unsupported');}
 async health(){try{return await this.sql.transaction(async tx=>{await tx.exec('SET LOCAL ROLE source_reader');const p=(await tx.query("SELECT has_table_privilege(current_user,'finance_snapshot','SELECT') r,has_table_privilege(current_user,'finance_snapshot','UPDATE') w")).rows[0];return p.r===true&&p.w===false;});}catch{return false;}}
 async testSandbox(){return {verified:false,checks:['sql-read-only','write-unsupported']};}
}
