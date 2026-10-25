// Full frozen suite via two deterministic HTTP dialects, never live models.
// 以两种确定性HTTP协议执行完整冻结任务，不调用真实模型。
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {loadSuite,executeControl,score} from '../src/evaluation/control-suite.ts';
import {createModelProtocolFixture} from '../src/evaluation/model-fixture.ts';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),{suite,sha256}=await loadSuite(root,2),rows=[],id=randomUUID();
for(const dialect of ['responses','chat-completions'])for(let repeat=1;repeat<=suite.repeats;repeat++)for(const task of suite.tasks){const fixture=await createModelProtocolFixture(dialect);try{const observed=await executeControl(task.input,root,suite.clock,fixture.model),judgment=score(task.expected,observed);rows.push({dialect,id:task.id,repeat,observed,...judgment});console.log(JSON.stringify({dialect,id:task.id,repeat,...judgment}));}finally{await fixture.close();}}
const passed=rows.filter(r=>r.pass).length,report={id,mode:'deterministic-http-protocol-fixtures',suiteHash:sha256,trials:rows.length,controlGatePasses:passed,controlGateFailures:rows.length-passed,protocolDialects:2,protocolFixtureCalls:rows.reduce((n,r)=>n+(r.observed.protocolFixtureCalls??0),0),actualModelCalls:0,modelsCompared:0,actualModelEvaluation:'NOT_RUN_USER_DEFERRED',realModelBusinessSuccess:null,realModelCostCny:null,realModelLatencyMs:null,manualBaseline:'NOT_RUN',fullProductAcceptance:false,rows};
await mkdir(resolve(root,'.evidence'),{recursive:true});await writeFile(resolve(root,'.evidence/e6-model-protocols-'+id+'.json'),JSON.stringify(report,null,2),{flag:'wx'});await writeFile(resolve(root,'.evidence/e6-model-protocols-latest.json'),JSON.stringify({id,file:'e6-model-protocols-'+id+'.json',pass:passed===rows.length,trials:rows.length,actualModelCalls:0},null,2));console.log(JSON.stringify({...report,rows:undefined}));if(passed!==rows.length)process.exitCode=1;
