// Explicit local operator command; does not register or execute imported workflows.
// 运维显式执行的本机命令；不自动登记或执行导入流程。
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {McpProcessReader,processResourceAllowlist,bpmnRevisionSchema} from '../src/connectors/mcp-process-reader.ts';
import {StdioProcessTransport,stdioProcessConfig} from '../src/connectors/mcp-stdio.ts';
import {processCoverage} from '../src/connectors/process-definition.ts';
import {referenceProcessBlueprint} from '../src/connectors/process-blueprint.ts';
const configSchema=z.object({transport:z.literal('stdio'),server:stdioProcessConfig,resources:processResourceAllowlist,bpmnRevisions:bpmnRevisionSchema.default({})}).strict().refine(v=>Object.keys(v.bpmnRevisions).every(uri=>v.resources.includes(uri)),'bpmn_resource_denied');
async function main(){const args=process.argv.slice(2),root=fileURLToPath(new URL('..',import.meta.url)),stages=JSON.parse(await readFile(resolve(root,'data/stages.json'),'utf8'));let config,out,blueprint;
 if(args.length===3&&args[0]==='--reference-blueprint'&&args[1]==='--out'&&isAbsolute(args[2])){blueprint=referenceProcessBlueprint(stages);config={transport:'stdio',server:{command:process.execPath,args:[resolve(root,'scripts/serve-process-resources.mjs')]},resources:blueprint.entries.map(e=>e.uri)};out=args[2];}
 else if(args.length===4&&args[0]==='--config'&&args[2]==='--out'&&isAbsolute(args[1])&&isAbsolute(args[3])){const stat=await lstat(args[1]);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16384)throw Error('process_config_invalid');config=configSchema.parse(JSON.parse(await readFile(args[1],'utf8')));out=args[3];}
 else throw Error('process_usage');
 const reader=new McpProcessReader(new StdioProcessTransport(config.server),config.resources,config.bpmnRevisions);try{const server=await reader.initialize(),resources=await reader.list(),evidence=[];for(const resource of resources)evidence.push(await reader.read(resource.uri));if(evidence.length!==config.resources.length)throw Error('process_resource_unavailable');const report={format:'enterprise-brain.process-read/1',origin:blueprint?'constructed_reference_blueprint':'configured_source_declaration',server,evidence,coverage:processCoverage(stages,evidence,blueprint?.suggestedMappings??[]),authority:'source_definitions_only',runtimeRegistered:false};await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({processes:evidence.length,modeledStages:report.coverage.stages,sourceReadStages:report.coverage.sourceReadStages,mappedStages:report.coverage.mappedStages,runtimeRegistered:false}));}finally{await reader.close();}}
main().catch(()=>{console.error('Process reading failed / 流程读取失败：check private config, protocol, allowed resources and new output path; no workflow executed.');process.exitCode=1;});
