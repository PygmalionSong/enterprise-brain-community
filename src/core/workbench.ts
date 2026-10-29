// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Approved constructed model is read from SQL; it contains no user navigation state.
// 已批准构造模型从SQL读取，不含用户导航状态。
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import {withEnterprise,type Database} from '../db/adapter.ts';
import {DEMO_ENTERPRISE} from '../industry/seed.ts';
import {hash} from '../runtime/contracts.ts';
import type {Actor} from '../identity/service.ts';
import {assertBusinessRole} from './repository.ts';
export async function initializeWorkbench(db:Database,root:string){const payload=JSON.parse(await readFile(join(root,'data/operating-snapshot.json'),'utf8')),checksum=hash(payload);if(Object.keys(payload.domains).length!==15||payload.operatingCube.length!==14256)throw Error('operating_snapshot_invalid');const old=(await db.query('SELECT checksum FROM operating_snapshot WHERE enterprise_id=$1 AND id=$2',[DEMO_ENTERPRISE,payload.version])).rows[0];if(old&&old.checksum!==checksum)throw Error('operating_snapshot_version_conflict');await db.query('INSERT INTO operating_snapshot VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[DEMO_ENTERPRISE,payload.version,checksum,JSON.stringify(payload)]);}
type SnapshotView={snapshot:unknown;evidence:{id:string;hash:unknown;factKinds:string[];definitionVersion:number;currency:string;asOf:string}};
type CachedSnapshot={checksum:unknown;revision:unknown;view:SnapshotView;body:Buffer;bytes:number};
// SQL/RLS is checked on every read, even a hit. Cache only immutable versioned data.
// 每次读取（含命中）都查询SQL/RLS；仅缓存不可变版本化内容。
const snapshotCaches=new WeakMap<Database,Map<string,CachedSnapshot>>();
const cacheByteLimit=64*1024*1024,cacheEntryLimit=2;
function freezeTree<T>(value:T):T{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freezeTree(item);Object.freeze(value);}return value;}
async function readSnapshot(db:Database,actor:Actor):Promise<CachedSnapshot>{
 assertBusinessRole(actor);
 return withEnterprise(db,actor.enterpriseId,async tx=>{
  const id='beverage-read-v1',head=(await tx.query('SELECT checksum,xmin::text AS revision FROM operating_snapshot WHERE id=$1',[id])).rows[0];
  if(!head)throw Error('snapshot_unavailable');
  let cache=snapshotCaches.get(db);if(!cache){cache=new Map();snapshotCaches.set(db,cache);}
  const key=actor.enterpriseId+'/'+id,prior=cache.get(key);
  if(prior&&prior.checksum===head.checksum&&prior.revision===head.revision){cache.delete(key);cache.set(key,prior);return prior;}
  cache.delete(key);
  const row=(await tx.query('SELECT payload,checksum,xmin::text AS revision FROM operating_snapshot WHERE id=$1',[id])).rows[0];
  if(!row)throw Error('snapshot_unavailable');
  const view=freezeTree({snapshot:row.payload,evidence:{id,hash:row.checksum,factKinds:['constructed_actual','scenario_plan'],definitionVersion:1,currency:'CNY',asOf:'2026-10-12'}}),body=Buffer.from(JSON.stringify(view)),entry={checksum:row.checksum,revision:row.revision,view,body,bytes:body.byteLength};
  if(entry.bytes<=cacheByteLimit){while(cache.size&&(cache.size>=cacheEntryLimit||[...cache.values()].reduce((n,v)=>n+v.bytes,0)+entry.bytes>cacheByteLimit))cache.delete(cache.keys().next().value!);cache.set(key,entry);}
  return entry;
 });
}
export async function operatingSnapshot(db:Database,actor:Actor){return (await readSnapshot(db,actor)).view;}
// Reuse encoded bytes after the same fresh access/version check; no HTTP/client cache.
// 新鲜权限及版本检查后复用编码字节，不启用HTTP/客户端缓存。
export async function operatingSnapshotBody(db:Database,actor:Actor){return (await readSnapshot(db,actor)).body;}
const querySchema=z.object({year:z.coerce.number().int().min(2024).max(2026),period:z.string().regex(/^(year|ytd|q[1-4]|m([1-9]|1[0-2]))$/),region:z.string().default('all'),category:z.string().default('all'),channel:z.string().default('all'),province:z.string().optional(),city:z.string().optional()}).strict();
export async function operatingAggregate(db:Database,actor:Actor,input:unknown){const q=querySchema.parse(input),model=await operatingSnapshot(db,actor),s=model.snapshot as any;const regions=s.portfolioRegions.map((r:any)=>r.id),categories=s.portfolioCategories.map((r:any)=>r.id),channels=s.channelData.map((r:any)=>r.id);if(q.region!=='all'&&!regions.includes(q.region)||q.category!=='all'&&!categories.includes(q.category)||q.channel!=='all'&&!channels.includes(q.channel))throw Error('invalid_context');const months=q.period==='year'?Array.from({length:12},(_,i)=>i+1):q.period==='ytd'?Array.from({length:q.year===2026?9:12},(_,i)=>i+1):q.period[0]==='q'?Array.from({length:3},(_,i)=>(Number(q.period[1])-1)*3+i+1):[Number(q.period.slice(1))];let rows=s.operatingCube.filter((r:any)=>r.year===q.year&&months.includes(r.month)&&(q.region==='all'||r.region===q.region)&&(q.category==='all'||r.category===q.category)&&(q.channel==='all'||r.channel===q.channel));if(q.city&&!q.province)throw Error('invalid_context');const region=q.province?s.territories.find((g:any)=>g.provinces.some((p:any)=>p[0]===q.province)):null;if(q.province&&(!region||q.region!=='all'&&q.region!==region.id))throw Error('invalid_context');const allocate=(total:number,weights:number[])=>{const sum=weights.reduce((a,b)=>a+b,0),raw=weights.map(w=>total*w/sum),n=raw.map(Math.floor),rank=raw.map((v,i)=>({i,r:v-n[i]})).sort((a,b)=>b.r-a.r||a.i-b.i);const missing=total-n.reduce((a,b)=>a+b,0);for(let i=0;i<missing;i++)n[rank[i%rank.length].i]++;return n;};const scale=(r:any,w:number[],i:number)=>{const out={...r},factor=w[i]/w.reduce((a,b)=>a+b,0);for(const k of ['revenue','cases','liters','grossProfit','opProfit','target','demand','supply','ka'])out[k]=r[k]*factor;out.due=allocate(r.due,w)[i];return out;};if(region){const i=region.provinces.findIndex((p:any)=>p[0]===q.province);rows=rows.filter((r:any)=>r.region===region.id).map((r:any)=>scale(r,region.provinces.map((p:any,j:number)=>p[2]*(r.channel==='ecommerce'&&j%2===0?1.09:1)*(r.category==='tea'&&j%3===1?1.06:1)*(r.month>=6&&r.month<=8&&j%2?1.04:1)),i));}if(q.city){const cities=s.v8Cities.filter((c:any)=>c.province===q.province),i=cities.findIndex((c:any)=>c.id===q.city);if(i<0)throw Error('invalid_context');rows=rows.map((r:any)=>scale(r,cities.map((c:any,j:number)=>c.base*(r.channel==='modern'&&j===0?1.18:1)*(r.channel==='traditional'&&c.kind==='aggregate'?1.2:1)*(r.category==='energy'&&j===1?1.12:1)*(r.month===8&&j===2?1.05:1)),i));}const sums:Record<string,number>={};for(const key of ['revenue','grossProfit','opProfit','cases','liters','demand','supply','due'])sums[key]=rows.reduce((n:number,r:any)=>n+r[key],0);return {context:{...q,months,currency:'CNY',amountUnit:'CNY_10000',volumeUnit:'sales_case_10000',definitionVersion:1,scenarioId:'BEV-PORTFOLIO-v1',scopeId:q.city??q.province??(q.region==='all'?'GROUP':q.region),factKind:q.year===2026&&months.some((m:number)=>m>=10)?'scenario_plan':'constructed_actual',evidence:model.evidence},sums,rows:rows.length};}
