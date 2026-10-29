import{qualifyPlatformSummary,windowsSkipContracts}from'./platform-test-results.mjs';
// Local checks and a minimal voluntary report; no network submission. / 本地检查及最小自愿报告，不联网提交。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function summarizeTap(output){
 output=output.replace(/\x1b\[[0-9;]*m/g,'');
 const fields={};
 for(const key of ['tests','pass','fail','cancelled','skipped','todo']){
  const matches=[...output.matchAll(new RegExp(`^(?:# |ℹ )${key} (\\d+)\\r?$`,'gm'))];
  if(matches.length!==1)return null;
  fields[key]=Number(matches[0][1]);
 }
 return fields;
}
export function minimalReport({manifestSha256,checks,tests,platformContractSkips,runId=randomUUID()}){
 if(platformContractSkips!==undefined&&(!Array.isArray(platformContractSkips)||platformContractSkips.length>3||new Set(platformContractSkips).size!==platformContractSkips.length||platformContractSkips.some(n=>!Object.values(windowsSkipContracts).flat().includes(n))))throw Error('Invalid declared platform skips');
 return {format:platformContractSkips===undefined?'enterprise-brain.installation-report/1':'enterprise-brain.installation-report/2',runId,...(platformContractSkips===undefined?{}:{platformContractSkips:[...platformContractSkips]}),
  sourceManifestSha256:manifestSha256,
  environment:{platform:process.platform,architecture:process.arch,node:process.versions.node},
  checks:checks.map(c=>({name:c.name,status:c.status})),tests:tests??null,
  independentUserVerified:false,cleanHostVerified:false,productionDeploymentVerified:false,
  liveModelVerified:false,telemetryEnabled:false,uploaded:false};
}
function main(){
 const args=process.argv.slice(2), values={};
 for(let i=0;i<args.length;i++){
  if(!['--out','--log-dir'].includes(args[i])||!args[i+1]||values[args[i]])throw Error('Use --out ABSOLUTE_NEW_REPORT --log-dir ABSOLUTE_NEW_PRIVATE_DIRECTORY');
  values[args[i]]=args[++i];
 }
 const out=values['--out'],logs=values['--log-dir'];
 if(!out||!logs||!path.isAbsolute(out)||!path.isAbsolute(logs)||fs.existsSync(out)||fs.existsSync(logs))throw Error('New absolute report/log paths required; nothing is overwritten.');
 // Refuse symlinked parents to avoid writing through an unexpected target. / 拒绝符号链接父目录。
 for(const target of [path.dirname(out),path.dirname(logs)]){
  if(!fs.statSync(target).isDirectory())throw Error('Output parent must already exist.');
  for(let at=target;;at=path.dirname(at)){if(fs.lstatSync(at).isSymbolicLink())throw Error('Symlinked output parent refused.');if(path.dirname(at)===at)break;}
 }
 fs.mkdirSync(logs);
 const checks=[],manifest=fs.readFileSync(path.join(root,'REPOSITORY_MANIFEST.json'));
 const tasks=[['inventory','scripts/verify-repository.mjs'],['typecheck','node_modules/typescript/bin/tsc','--noEmit'],['build','scripts/build.mjs'],['sdk-tests','scripts/test-sdk.mjs']];
 let stopped=false,tests=null,platformContractSkips=[];
 for(const [name,...command] of tasks){
  if(stopped){checks.push({name,status:'not-run'});continue;}
  const result=spawnSync(process.execPath,command,{cwd:root,encoding:'utf8',windowsHide:true,timeout:1_500_000,maxBuffer:16*1024*1024});
  const output=(result.stdout??'')+'\n'+(result.stderr??'');
  fs.writeFileSync(path.join(logs,name+'.log'),output,{flag:'wx'});
  let pass=result.status===0&&!result.error&&!result.signal;
  if(name==='sdk-tests'){
   tests=summarizeTap(output);
   const scope=qualifyPlatformSummary(tests,output,'__sdk_suite__');platformContractSkips=scope.platformSkips;pass=pass&&scope.qualified;
  }
  checks.push({name,status:pass?'passed':'failed'});stopped=!pass;
  console.log(`${name}: ${pass?'passed':'failed'}`);
 }
 const report=minimalReport({manifestSha256:createHash('sha256').update(manifest).digest('hex'),checks,tests,platformContractSkips});
 fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log('Local report created. Review it before voluntary sharing. Nothing uploaded. / 本地报告已生成，请先审阅；没有上传。');
 process.exitCode=stopped?1:0;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main();}catch{console.error('Installation verification refused or incomplete; inspect private local evidence. / 安装验证拒绝或未完成，请检查私人本地证据。');process.exitCode=1;}
}
