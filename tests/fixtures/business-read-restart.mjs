// Separate OS process; constructed IT connection state, real source GET/receipts.
// 独立OS进程；IT连接状态由夹具构造，源GET与回执真实。
import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';
import {setup} from './business-read.ts';import {openDatabase} from '../../src/db/adapter.ts';
import {BusinessReadGrants} from '../../src/onboarding/business-read-grants.ts';import {BusinessReadService} from '../../src/onboarding/business-read-service.ts';
const [mode,root,endpoint]=process.argv.slice(2),stateFile=join(root,'state.private.json'),location=join(root,'database');
if(mode==='prepare'){
 const f=await setup(false,location);try{const grants=new BusinessReadGrants(f.db),policy=await grants.reviewPolicy(f.actors.it,{policy:{...f.proof.policy,endpoint},endpointAndFieldsAcknowledged:true});await f.seedValidation(policy.id);const grant=await grants.approve(f.actors.executive,policy.id,{expectedVersion:1,policySha256:policy.sha256,businessReadAcknowledged:true});await writeFile(stateFile,JSON.stringify({actor:f.actors.operations,proof:await grants.proof(f.actors.operations,grant.id)}));}finally{await f.close();}
}else{
 const {actor,proof}=JSON.parse(await readFile(stateFile,'utf8')),db=await openDatabase(location);try{
  const service=new BusinessReadService(new BusinessReadGrants(db));
  const result=mode==='submit'?await service.submit(actor,proof,endpoint):await service.lookup(actor,proof,endpoint);
  console.log(JSON.stringify(result));
 }finally{await db.close();}
}
