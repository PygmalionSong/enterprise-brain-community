// Code inventory defines readiness; degraded identity remains available for safe shutdown.
// 以代码迁移清单判断就绪；降级时仍保留安全停服所需的实例身份。
import {readFile,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import type {Sql} from './adapter.ts';
export type SchemaInventory=ReadonlyArray<Readonly<{id:string;checksum:string}>>;
export async function readSchemaInventory(directory:string):Promise<SchemaInventory>{
 const names=(await readdir(directory)).sort();if(!names.length||names.length>999)throw Error('enterprise_migration_inventory_invalid');const entries:{id:string;checksum:string}[]=[];
 for(let i=0;i<names.length;i++){const id=names[i],match=/^(\d{3})_[a-z0-9_]+\.sql$/.exec(id),file=join(directory,id),stat=await lstat(file);if(!match||Number(match[1])!==i+1||!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024)throw Error('enterprise_migration_inventory_invalid');const bytes=await readFile(file);if(bytes.length>2*1024*1024)throw Error('enterprise_migration_inventory_invalid');entries.push(Object.freeze({id,checksum:createHash('sha256').update(bytes).digest('hex')}));}
 return Object.freeze(entries);
}
export async function inspectSchemaHealth(db:Sql,expected:SchemaInventory){
 try{const rows=(await db.query<{id:string;checksum:string}>('SELECT id,checksum FROM schema_migration ORDER BY id')).rows,current=rows.length===expected.length&&rows.every((row,index)=>row.id===expected[index].id&&row.checksum===expected[index].checksum);return {state:current?'current' as const:'mismatch' as const,applied:rows.length,expected:expected.length};}
 catch{return {state:'unavailable' as const,applied:null,expected:expected.length};}
}
