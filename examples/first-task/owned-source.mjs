// Owned example protocol/ledger, never a real enterprise connector.
// 自有示例协议与账本，不是真实企业连接器。
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {isAbsolute} from 'node:path';

export const serverInfo={name:'enterprise-brain-first-task-owned',version:'1'};
const label={zh:'合成检查',en:'Constructed check',ja:'構成チェック'};
export const resources=['review','handover'].map(id=>({uri:'process://first-task/'+id,definition:{format:'enterprise-brain.process/1',id,revision:'1',name:{...label},kind:'workflow_definition',objects:[{id:'record',name:label}],roles:[{id:'owner',name:label}],nodes:[{id:'start',name:label,kind:'start',ownerRole:'owner',objectRefs:['record']},{id:'check',name:label,kind:'task',ownerRole:'owner',objectRefs:['record']},{id:'end',name:label,kind:'end',ownerRole:'owner',objectRefs:['record']}],edges:[{id:'start_check',from:'start',to:'check'},{id:'check_end',from:'check',to:'end'}]}}));
const envelope={type:'object',properties:{reference:{type:'string'},arguments:{type:'object'},actor:{type:'object'}},required:['reference','arguments','actor'],additionalProperties:false};
export const descriptors=[{name:'first.submit',description:'Commit an owned constructed check',inputSchema:envelope,annotations:{readOnlyHint:false}},{name:'first.lookup',description:'Read the original owned receipt',inputSchema:envelope,annotations:{readOnlyHint:true}}];
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function ledger(file){const db=new DatabaseSync(file);db.exec('CREATE TABLE IF NOT EXISTS jobs(enterprise_id TEXT,reference TEXT,args_sha TEXT,value INTEGER,state TEXT,revision TEXT,PRIMARY KEY(enterprise_id,reference));CREATE TABLE IF NOT EXISTS calls(method TEXT,reference TEXT);');return db;}
export function inspectLedger(file){const db=new DatabaseSync(file,{readOnly:true});try{return{jobs:db.prepare('SELECT * FROM jobs ORDER BY reference').all(),calls:db.prepare('SELECT * FROM calls').all()};}finally{db.close();}}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [mode,file]=process.argv.slice(2);if(!['resources','tools'].includes(mode)||mode==='tools'&&(!file||!isAbsolute(file)))throw Error('owned_source_usage');
 let initialized=false;const reply=(id,result)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');
 for await(const line of createInterface({input:process.stdin})){
  const q=JSON.parse(line);if(q.method==='notifications/initialized'){initialized=true;continue;}if(!Object.hasOwn(q,'id'))continue;
  if(q.method==='initialize'){reply(q.id,{protocolVersion:'2025-11-25',capabilities:mode==='resources'?{resources:{}}:{tools:{}},serverInfo});continue;}
  if(!initialized)throw Error('owned_source_not_initialized');
  if(mode==='resources'&&q.method==='resources/list'){reply(q.id,{resources:resources.map(r=>({uri:r.uri,name:r.definition.id,mimeType:'application/json'}))});continue;}
  if(mode==='resources'&&q.method==='resources/read'){const r=resources.find(r=>r.uri===q.params?.uri);if(!r)throw Error('owned_resource_denied');reply(q.id,{contents:[{uri:r.uri,mimeType:'application/json',text:JSON.stringify(r.definition)}]});continue;}
  if(mode==='tools'&&q.method==='tools/list'){reply(q.id,{tools:descriptors});continue;}
  if(mode==='tools'&&q.method==='tools/call'){
   const {name,arguments:input}=q.params??{}, {reference,arguments:args,actor}=input??{};
   if(!['first.submit','first.lookup'].includes(name)||!/^[a-f0-9-]{36}$/.test(reference??'')||!actor?.enterpriseId||!actor.principalId||!['executive','operations'].includes(actor.role)||actor.authorizationVersion!==1||Object.keys(args??{}).join(',')!=='value'||!Number.isInteger(args.value)||args.value<1||args.value>100)throw Error('owned_source_input_denied');
   const db=ledger(file);let row;try{
    db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO calls VALUES(?,?)').run(name,reference);
    if(name==='first.submit'){const old=db.prepare('SELECT * FROM jobs WHERE enterprise_id=? AND reference=?').get(actor.enterpriseId,reference);if(old&&old.args_sha!==sha(args))throw Error('owned_source_idempotency_conflict');db.prepare("INSERT OR IGNORE INTO jobs VALUES(?,?,?,?,'completed','owned-one')").run(actor.enterpriseId,reference,sha(args),args.value);}
    row=db.prepare('SELECT * FROM jobs WHERE enterprise_id=? AND reference=?').get(actor.enterpriseId,reference);db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
   // Deliberately lose the response only AFTER the source transaction committed.
   // 只在源端事务实际提交之后，故意丢失提交响应。
   if(name==='first.submit')process.exit(0);
   reply(q.id,{content:[{type:'text',text:'Owned fixture receipt / 自有夹具回执'}],structuredContent:{reference,state:row?.state??'missing',receiptRef:row?'first-'+reference:null,sourceRevision:row?.revision??null,data:row?{value:row.value}:{}}});continue;
  }
  throw Error('owned_source_method_denied');
 }
}
