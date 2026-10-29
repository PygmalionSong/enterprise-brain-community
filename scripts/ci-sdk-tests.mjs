import{qualifyPlatformSummary}from'./platform-test-results.mjs';
import{summarizeFailureDiagnostics}from'./ci-failure-diagnostics.mjs';
// Bounded source-test shards, never enterprise operations. / 有界源码测试分组，不执行企业运维。
import fs from'node:fs';import path from'node:path';import{fileURLToPath}from'node:url';import{createHash,randomUUID}from'node:crypto';import{spawn,spawnSync}from'node:child_process';import{summarizeTap}from'./installation-report.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function selectShard(source,shard,total=4){
 if(!Number.isInteger(shard)||shard<1||shard>total||total!==4)throw Error('Invalid shard');
 const files=[...source.matchAll(/"(tests\/[a-z0-9-]+\.test\.ts)"/g)].map(m=>m[1]);
 if(files.length<50||new Set(files).size!==files.length)throw Error('Incomplete or duplicate SDK list');
 return{all:files,selected:files.filter((_,i)=>i%total===shard-1)};
}
export function isolatedTestEnvironment(source,isolatePg=true,canonicalizeTemp=true){const env={...source};for(const key of Object.keys(env))if(key==='NODE_TEST_CONTEXT'||isolatePg&&/^PG/i.test(key))delete env[key];if(canonicalizeTemp)for(const key of['TEMP','TMP'])if(env[key])env[key]=fs.realpathSync(env[key]);return env;}
export function qualifyPlatformTap(text,file,platform=process.platform){return qualifyPlatformSummary(summarizeTap(text),text,file,platform);}
export async function runOwnedFile(cwd,file,logFile,timeoutMs=180000,isolatePg=true,canonicalizeTemp=true){
 const env=isolatedTestEnvironment(process.env,isolatePg,canonicalizeTemp);
 if(canonicalizeTemp){const owned=path.join(cwd,'.evidence','ci-temporary');fs.mkdirSync(owned,{recursive:true});env.TEMP=fs.realpathSync(owned);env.TMP=env.TEMP;}
 const child=spawn(process.execPath,['--test','--test-reporter=tap',file],{cwd,env,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
 const log=fs.createWriteStream(logFile,{flags:'wx'});let text='',timedOut=false;
 for(const stream of[child.stdout,child.stderr])stream.on('data',chunk=>{log.write(chunk);if(text.length<16*1024*1024)text+=chunk.toString('utf8');});
 const timer=setTimeout(()=>{timedOut=true;if(child.exitCode!==null||!child.pid)return;
  // Only this still-owned child tree. / 仅此仍属本次调用的子树。
  if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:10000});else try{process.kill(-child.pid,'SIGKILL');}catch{}
 },timeoutMs);
 const outcome=await new Promise(resolve=>{child.once('error',()=>resolve({exit:null,error:true}));child.once('close',(code,signal)=>resolve({exit:code,signal}));});
 clearTimeout(timer);await new Promise(resolve=>{log.once('close',resolve);log.end();});const counts=summarizeTap(text);
 const platformQualification=qualifyPlatformTap(text,file),passed=!timedOut&&outcome.exit===0&&platformQualification.qualified;
 const errorCodes=[...new Set(text.match(/\b(?:native_runtime_environment_conflict|native_runtime_configuration_invalid|native_backup_tool_environment_conflict|ENOENT|EACCES|EPERM)\b/g)??[])];
 const failureDiagnostics=passed?undefined:summarizeFailureDiagnostics(text,fs.readFileSync(path.resolve(cwd,file),'utf8'));
 return{failureDiagnostics,file,status:passed?'passed':'failed',timedOut,exit:outcome.exit,counts,platformSkips:platformQualification.platformSkips,errorCodes};
}
async function main(){
 const args=process.argv.slice(2);if(args.length!==6||args[0]!=='--shard'||args[2]!=='--out'||args[4]!=='--log-dir')throw Error('Use --shard 1..4 --out ABSOLUTE_NEW_REPORT --log-dir ABSOLUTE_NEW_PRIVATE_DIRECTORY');
 const shard=Number(args[1]),out=args[3],logs=args[5],plan=selectShard(fs.readFileSync(path.join(root,'scripts/test-sdk.mjs'),'utf8'),shard);
 for(const target of[out,logs])if(!path.isAbsolute(target)||fs.existsSync(target)||!fs.statSync(path.dirname(target)).isDirectory())throw Error('New absolute paths required');
 fs.mkdirSync(logs);fs.mkdirSync(path.join(root,'.evidence'),{recursive:true});const results=[];
 const inheritedPgVariableCount=Object.entries(process.env).filter(([k,v])=>/^PG/i.test(k)&&v).length;
 // Separate precondition evidence, not part of the SDK coverage total. / 单独前提证据，不计入SDK覆盖总数。
 const environmentQualification=[];
 if(shard===4&&inheritedPgVariableCount>0){const file='tests/native-backup-tools.test.ts';const inherited=await runOwnedFile(root,file,path.join(logs,'inherited-pg.log'),180000,false,false),isolated=await runOwnedFile(root,file,path.join(logs,'isolated-pg.log'),180000,true,false);environmentQualification.push({kind:'pg-only',file,inherited,isolated,verified:inherited.status==='failed'&&inherited.errorCodes.includes('native_backup_tool_environment_conflict')&&isolated.status==='passed'});}
 const temporaryAliasDetected=['TEMP','TMP'].some(k=>process.env[k]&&(process.platform==='win32'?fs.realpathSync(process.env[k]).toLowerCase()!==process.env[k].toLowerCase():fs.realpathSync(process.env[k])!==process.env[k]));
 if(shard===4){const file='tests/native-runtime-connection.test.ts';const inherited=await runOwnedFile(root,file,path.join(logs,'inherited-temp.log'),180000,false,false),isolated=await runOwnedFile(root,file,path.join(logs,'canonical-temp.log'),180000,false,true);environmentQualification.push({kind:'temp-only',file,inherited,isolated,verified:isolated.status==='passed'&&(inherited.status==='passed'||inherited.errorCodes.includes('native_runtime_configuration_invalid'))});}
 for(const file of plan.selected){const result=await runOwnedFile(root,file,path.join(logs,path.basename(file)+'.log'));results.push(result);console.log(JSON.stringify(result));}
 const passed=results.every(r=>r.status==='passed')&&environmentQualification.every(q=>q.verified),hash=b=>createHash('sha256').update(b).digest('hex');
 const report={format:'enterprise-brain.ci-shard/1',runId:randomUUID(),shard,totalShards:4,sourceManifestSha256:hash(fs.readFileSync(path.join(root,'REPOSITORY_MANIFEST.json'))),sdkFileListSha256:hash(plan.all.join('\n')),allSdkFiles:plan.all.length,selectedFiles:plan.selected,results,passed,tests:passed?results.reduce((sum,r)=>sum+r.counts.tests,0):null,inheritedPgVariableCount,temporaryAliasDetected,ownedTemporaryNamespace:true,testChildEnvironmentIsolated:true,productGuardsChanged:false,environmentQualification,cleanCustomerHostVerified:false,liveModelVerified:false,customerTelemetryUsed:false};
 fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log('CI_SHARD_REPORT '+JSON.stringify(report));process.exitCode=passed?0:1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('CI source verification incomplete. / CI源码验证未完成。');process.exitCode=1;});
