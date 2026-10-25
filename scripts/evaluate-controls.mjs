// Runs fresh isolated SQL/HTTP fixtures; never contacts a model provider.
// 运行新建隔离SQL/HTTP案例，不调用模型供应商。
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSuite,executeControl,score,controlReport} from '../src/evaluation/control-suite.ts';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),version=Number(process.argv[2]??2),{suite,sha256}=await loadSuite(root,version),rows=[];
for(let repeat=1;repeat<=suite.repeats;repeat++)for(const task of suite.tasks){const observed=await executeControl(task.input,root,suite.clock),judgment=score(task.expected,observed);rows.push({id:task.id,repeat,observed,...judgment});console.log(JSON.stringify({id:task.id,repeat,...judgment}));}
const report=controlReport(rows,sha256);await mkdir(resolve(root,'.evidence'),{recursive:true});await writeFile(resolve(root,'.evidence/e6-control-dry-run-v'+version+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({mode:report.mode,trials:report.trials,pass:report.controlGatePasses,fail:report.controlGateFailures,actualModelCalls:0}));if(report.controlGateFailures)process.exitCode=1;
