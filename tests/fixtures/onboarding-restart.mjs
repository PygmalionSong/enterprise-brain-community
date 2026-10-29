// A separate process opens the original owned PGlite directory; never replays HTTP.
// 独立进程重开原自有PGlite目录，不重放HTTP探测。
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../../src/db/adapter.ts';
import {migrate} from '../../src/db/migrate.ts';
import {DiscoveryStore} from '../../src/onboarding/discovery-store.ts';
import {inspectProtocolObservation} from '../../src/onboarding/protocol-observation.ts';
const [mode,directory]=process.argv.slice(2);
if(!['claim','commit','inspect'].includes(mode)||!directory||resolve(directory)!==directory)throw Error('owned_fixture_arguments');
const db=await openDatabase(join(directory,'database'));
try{
 await migrate(db,join(process.cwd(),'migrations'));const store=new DiscoveryStore(db);
 if(mode==='inspect'){
  const saved=JSON.parse(await readFile(join(directory,'identity.json'),'utf8'));
  const status=await store.run(saved.actor,saved.run.id);let next;
  try{next=await store.claimNext(saved.actor,saved.run.id);}catch(e){next=e.message;}
  const count=Number((await db.query('SELECT count(*) n FROM onboarding_evidence WHERE run_id=$1',[saved.run.id])).rows[0].n);
  console.log(JSON.stringify({runId:status.id,state:status.state,needsRecovery:status.needsRecovery,evidenceCount:count,evidenceId:status.targets[0].evidenceId,nextClaim:next,newHttpRequests:0}));
 }else{
  const actor={id:randomUUID(),enterpriseId:randomUUID(),role:'it',authorizationVersion:1};
  await db.query("INSERT INTO enterprise VALUES($1,'Owned restart','enterprise','CNY','UTC')",[actor.enterpriseId]);
  await db.query("INSERT INTO principal(id,enterprise_id,username,role) VALUES($1,$2,'owned-it','it')",[actor.id,actor.enterpriseId]);
  const scope=await store.createScope(actor,{endpoints:['http://127.0.0.1:19001/$metadata'],idempotencyKey:'owned-scope',scopeAcknowledged:true});
  const run=await store.createRun(actor,{scopeId:scope.id,expectedScopeVersion:1,idempotencyKey:'owned-run'}),claim=await store.claimNext(actor,run.id);
  let receipt=null;
  if(mode==='commit')receipt=await store.accept(actor,claim,inspectProtocolObservation({status:200,contentType:'application/json',body:JSON.stringify({$Version:'4.01',Owned:{Row:{$Kind:'EntityType',$Key:['Id'],Id:{$Type:'Edm.String',$Nullable:false}}}})}));
  await writeFile(join(directory,'identity.json'),JSON.stringify({actor,scope,run,claim}),{flag:'wx'});
  console.log(JSON.stringify({runId:run.id,evidenceId:receipt?.id??null,newHttpRequests:0}));
 }
}finally{await db.close();}
