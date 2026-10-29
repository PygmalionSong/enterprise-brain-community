// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
import{canonicalPathEqual}from'../platform/canonical-path.ts';
// Bounded immutable controller succession; no claim is deleted or stolen by age.
// 有界、不可改写的控制器接续链；不删除声明、不凭锁龄接管。
import {readFile,lstat,realpath,mkdir,open,rename} from 'node:fs/promises';
import {join,resolve,isAbsolute} from 'node:path';import {hostname} from 'node:os';import {createHash,randomUUID} from 'node:crypto';import {z} from 'zod';
import {readPrivateJson} from './configuration.ts';import {processExists} from './operation-guard.ts';import {nativePreparationIntentSchema} from './native-dba-core.ts';
const sha=z.string().regex(/^[a-f0-9]{64}$/),absolute=z.string().max(1024).refine(v=>isAbsolute(v)&&resolve(v)===v),pid=z.number().int().positive();
const adoption=z.object({id:z.uuid(),createdAt:z.iso.datetime(),pid,claimText:z.string().max(4096)}).strict();
export const nativePreparationJournalSchema=z.object({format:z.literal(1),id:z.uuid(),host:z.string().min(1).max(255),version:z.number().int().positive().max(1000),configuration:absolute,workDirectory:absolute,inputFile:absolute,inputSha256:sha,codeSha256:sha,credentialsSha256:sha,phase:z.enum(['registered','commit_intent','database_verified','publishing','completed']),intent:nativePreparationIntentSchema.nullable(),adoption,priorAdoptions:z.array(adoption).max(63),configurationSha256:sha.nullable()}).strict().refine(q=>q.phase==='registered'?q.intent===null:q.intent!==null).refine(q=>q.phase==='completed'?q.configurationSha256!==null:q.configurationSha256===null);
export type NativePreparationJournal=z.infer<typeof nativePreparationJournalSchema>;
const claimSchema=z.object({format:z.literal(1),id:z.uuid(),operationId:z.uuid(),predecessor:sha,host:z.string().min(1).max(255),pid,createdAt:z.iso.datetime()}).strict();
const digest=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex'),host=()=>hostname().toLowerCase();
async function realDirectory(file:string){absolute.parse(file);const s=await lstat(file);if(!s.isDirectory()||s.isSymbolicLink()||!canonicalPathEqual((await realpath(file)),file))throw Error('native_prepare_journal_path_invalid');}
async function fresh(file:string,text:string){const f=await open(file,'wx',0o600);try{await f.writeFile(text);await f.sync();}finally{await f.close();}}
async function optional(file:string,max=16384){try{const q=await readPrivateJson(file,max);return {value:q,text:await readFile(file,'utf8')};}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
export async function readNativePreparationJournal(workDirectory:string,configuration:string){await realDirectory(workDirectory);const file=join(workDirectory,'journal.json'),q=nativePreparationJournalSchema.parse(await readPrivateJson(file,524288));if(q.workDirectory!==workDirectory||q.configuration!==configuration||q.host!==host()||await readFile(file,'utf8')!==JSON.stringify(q))throw Error('native_prepare_journal_binding_changed');return q;}
export async function nativePreparationOwnership(q:NativePreparationJournal){
 await realDirectory(q.workDirectory);const directory=join(q.workDirectory,'controllers');await realDirectory(directory);let predecessor=digest(q.id),last:ReturnType<typeof claimSchema.parse>|null=null,live=false;const chain:{sha256:string;released:boolean}[]=[];
 for(let i=0;i<64;i++){const file=join(directory,predecessor+'.json'),item=await optional(file,4096);if(!item)return {sha256:digest(JSON.stringify(chain)),predecessor,file,live,ownerPid:last?.pid??null,depth:chain.length};
  const c=claimSchema.parse(item.value);if(c.operationId!==q.id||c.predecessor!==predecessor||c.host!==q.host||JSON.stringify(c)!==item.text)throw Error('native_prepare_controller_binding_changed');
  const claimSha=digest(item.text),release=await optional(join(directory,'released-'+c.id+'.json'),1024);if(release&&(JSON.stringify(release.value)!==JSON.stringify({format:1,claimSha256:claimSha})||release.text!==JSON.stringify(release.value)))throw Error('native_prepare_controller_release_changed');
  if(last&&live)throw Error('native_prepare_controller_chain_invalid');last=c;live=!release&&processExists(c.pid);chain.push({sha256:claimSha,released:!!release});predecessor=claimSha;
 }
 throw Error('native_prepare_controller_limit');
}
export async function createNativePreparationJournal(input:NativePreparationJournal){const q=nativePreparationJournalSchema.parse(input);if(q.phase!=='registered'||q.version!==1||q.host!==host())throw Error('native_prepare_journal_initial_invalid');await mkdir(q.workDirectory,{mode:0o700});await realDirectory(q.workDirectory);await mkdir(join(q.workDirectory,'controllers'),{mode:0o700});await fresh(join(q.workDirectory,'journal.json'),JSON.stringify(q));return q;}
export class NativePreparationOwner {
 private journal:NativePreparationJournal;private file:string;private claimText:string;private id:string;private journalSha:string;private closed=false;
 private constructor(q:NativePreparationJournal,file:string,claimText:string,id:string){this.journal=q;this.file=file;this.claimText=claimText;this.id=id;this.journalSha=digest(JSON.stringify(q));}
 static async acquire(q:NativePreparationJournal,expectedJournalSha256:string,expectedOwnershipSha256:string){
  sha.parse(expectedJournalSha256);sha.parse(expectedOwnershipSha256);const current=await readNativePreparationJournal(q.workDirectory,q.configuration),ownership=await nativePreparationOwnership(current);
  if(digest(JSON.stringify(current))!==expectedJournalSha256||ownership.sha256!==expectedOwnershipSha256)throw Error('native_prepare_recovery_plan_changed');if(ownership.live)throw Error('native_prepare_controller_alive');
  const claim=claimSchema.parse({format:1,id:randomUUID(),operationId:q.id,predecessor:ownership.predecessor,host:q.host,pid:process.pid,createdAt:new Date().toISOString()}),text=JSON.stringify(claim);try{await fresh(ownership.file,text);}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw Error('native_prepare_controller_busy');throw e;}
  const owner=new NativePreparationOwner(current,ownership.file,text,claim.id);await owner.guard();return owner;
 }
 async guard(){if(this.closed||await readFile(this.file,'utf8')!==this.claimText)throw Error('native_prepare_controller_changed');const current=await readNativePreparationJournal(this.journal.workDirectory,this.journal.configuration);if(digest(JSON.stringify(current))!==this.journalSha)throw Error('native_prepare_journal_conflict');const ownership=await nativePreparationOwnership(current);if(ownership.ownerPid!==process.pid||!ownership.live||ownership.predecessor!==digest(this.claimText))throw Error('native_prepare_controller_changed');}
 async change(update:Partial<Pick<NativePreparationJournal,'phase'|'intent'|'adoption'|'priorAdoptions'|'configurationSha256'>>){
  await this.guard();const previous=this.journal,next=nativePreparationJournalSchema.parse({...previous,...update,version:previous.version+1});
  const order=['registered','commit_intent','database_verified','publishing','completed'];if(order.indexOf(next.phase)<order.indexOf(previous.phase)||order.indexOf(next.phase)>order.indexOf(previous.phase)+1||previous.phase==='completed')throw Error('native_prepare_journal_transition_invalid');
  if(previous.intent&&JSON.stringify(previous.intent)!==JSON.stringify(next.intent))throw Error('native_prepare_intent_changed');if(JSON.stringify(next.adoption)!==JSON.stringify(previous.adoption)){if(JSON.stringify(next.priorAdoptions)!==JSON.stringify([...previous.priorAdoptions,previous.adoption]))throw Error('native_prepare_adoption_history_changed');}else if(JSON.stringify(next.priorAdoptions)!==JSON.stringify(previous.priorAdoptions))throw Error('native_prepare_adoption_history_changed');const temporary=join(previous.workDirectory,'journal-'+randomUUID()+'.tmp'),file=join(previous.workDirectory,'journal.json');await fresh(temporary,JSON.stringify(next));const until=Date.now()+250;
  while(true){await this.guard();try{await rename(temporary,file);break;}catch(e){if(process.platform!=='win32'||!['EPERM','EBUSY'].includes((e as NodeJS.ErrnoException).code??'')||Date.now()>=until)throw e;await new Promise<void>(ok=>setTimeout(ok,10));}}
  this.journal=next;this.journalSha=digest(JSON.stringify(next));return next;
 }
 async view(){await this.guard();return structuredClone(this.journal);}
 async release(){if(this.closed)return;await this.guard();await fresh(join(this.journal.workDirectory,'controllers','released-'+this.id+'.json'),JSON.stringify({format:1,claimSha256:digest(this.claimText)}));this.closed=true;}
}
export const nativePreparationJournalSha256=(q:NativePreparationJournal)=>digest(JSON.stringify(q));
