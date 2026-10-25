// Explicit private file only; never fabricate a human baseline or publish traces.
// 仅导入显式私人文件，不虚构人工基线，不发布执行轨迹。
import {readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {loadSuite} from '../src/evaluation/control-suite.ts';
import {validateManualBaseline} from '../src/evaluation/manual-baseline.ts';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
try{const file=process.argv[2];if(!file)throw Error('manual_input_required');if((await stat(resolve(file))).size>4194304)throw Error('manual_input_limit');const input=JSON.parse(await readFile(resolve(file),'utf8')),frozen=await loadSuite(root,2),report=validateManualBaseline(input,frozen.suite,frozen.sha256),id=randomUUID();await mkdir(resolve(root,'.evidence'),{recursive:true});await writeFile(resolve(root,'.evidence/manual-baseline-'+id+'.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({id,status:report.status,records:report.records,sourceEvidenceValidated:false,aiEfficiencyImprovement:null}));}catch{console.error('人工记录未导入 / Manual records were not imported');process.exitCode=1;}
