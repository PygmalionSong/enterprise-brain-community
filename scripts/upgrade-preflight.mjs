// Read-only signed installation eligibility. Never import or execute candidate code.
// 只读核验签名安装与静态升级资格；不导入或执行候选代码。
import {readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {verifyTree} from './release.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputSchema=z.object({format:z.literal(1),currentRoot:z.string(),candidateRoot:z.string(),publicKeyFile:z.string(),pinnedFingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
function versionParts(value){if(typeof value!=='string'||!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value))throw Error('upgrade_version_contract_invalid');return value.split('.').map(Number);}
const inside=(root,file)=>{const r=relative(root,file);return r===''||(!r.startsWith('..')&&!isAbsolute(r));};
async function direct(file,directory=false){
 if(!isAbsolute(file)||resolve(file)!==file)throw Error('upgrade_absolute_path_required');
 const stat=await lstat(file);if(stat.isSymbolicLink()||(directory?!stat.isDirectory():!stat.isFile()))throw Error('upgrade_indirect_path_denied');
 if((await realpath(file)).toLowerCase()!==file.toLowerCase())throw Error('upgrade_indirect_path_denied');return stat;
}
async function bounded(file,max){const stat=await direct(file);if(stat.size>max)throw Error('upgrade_input_limit');const bytes=await readFile(file);if(bytes.length>max)throw Error('upgrade_input_limit');return bytes;}
function json(bytes){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('upgrade_json_invalid');}}
async function installation(root,key,pin){
 await direct(root,true);const before=await bounded(join(root,'RELEASE.json'),2*1024*1024);await verifyTree(root,key,pin);const after=await bounded(join(root,'RELEASE.json'),2*1024*1024);if(!before.equals(after))throw Error('upgrade_installation_changed');
 const signed=json(after),manifest=json(Buffer.from(signed.manifestText)),entries=new Map(manifest.entries.map(e=>[e.path,e]));
 async function file(name,max=2*1024*1024){const entry=entries.get(name);if(!entry)throw Error('upgrade_required_file_missing');const bytes=await bounded(join(root,name),max);if(sha(bytes)!==entry.sha256||bytes.length!==entry.size)throw Error('upgrade_installation_changed');return bytes;}
 const pkg=json(await file('package.json'));
 if(pkg.name!=='enterprise-brain'||pkg.type!=='module'||pkg.engines?.node!=='>=24.0.0 <25'||typeof pkg.version!=='string'||pkg.version!==manifest.version||manifest.node!=='24.19.0'||manifest.architecture!=='x64'||!['local-windows-existing-node24','local-windows-bundled-node24'].includes(manifest.profile))throw Error('upgrade_application_contract_mismatch');versionParts(pkg.version);
 for(const name of ['src/enterprise/operations.ts','scripts/enterprise.mjs','dist/enterprise-operations.mjs','pnpm-lock.yaml'])await file(name,8*1024*1024);
 const migrations=[...entries.keys()].filter(name=>name.startsWith('migrations/')).sort(),inventory=[];
 if(!migrations.length)throw Error('upgrade_migration_inventory_invalid');
 for(let i=0;i<migrations.length;i++){const name=migrations[i],match=/^migrations\/(\d{3})_[a-z0-9_]+\.sql$/.exec(name);if(!match||Number(match[1])!==i+1)throw Error('upgrade_migration_inventory_invalid');await file(name);inventory.push({path:name,sha256:entries.get(name).sha256});}
 return {root,manifest,manifestSha256:sha(signed.manifestText),pkg,entries,migrations:inventory};
}
// Return the same static evidence without creating files or opening a database.
// 返回相同静态证据，不创建文件或打开数据库。
export async function inspectUpgradeInstallations(value){
 const input=inputSchema.parse(value);
 for(const root of [input.currentRoot,input.candidateRoot])if(inside(root,input.publicKeyFile))throw Error('upgrade_private_path_inside_installation');
 if(inside(input.currentRoot,input.candidateRoot)||inside(input.candidateRoot,input.currentRoot))throw Error('upgrade_installations_overlap');
 await bounded(input.publicKeyFile,4096);
 // Use this trusted installation's verifier and a separately pinned publisher key.
 // 使用当前受信核验器与独立固定的发布者公钥，不运行候选的核验器。
 const current=await installation(input.currentRoot,input.publicKeyFile,input.pinnedFingerprint),candidate=await installation(input.candidateRoot,input.publicKeyFile,input.pinnedFingerprint);
 const from=versionParts(current.pkg.version),to=versionParts(candidate.pkg.version);for(let i=0;i<3;i++){if(to[i]<from[i])throw Error('upgrade_version_downgrade');if(to[i]>from[i])break;}
 if(candidate.migrations.length<current.migrations.length)throw Error('upgrade_migration_removed');
 for(let i=0;i<current.migrations.length;i++)if(JSON.stringify(current.migrations[i])!==JSON.stringify(candidate.migrations[i]))throw Error('upgrade_migration_prefix_changed');
 if(current.manifestSha256===candidate.manifestSha256)throw Error('upgrade_candidate_identical');
 const changes=[];for(const name of new Set([...current.entries.keys(),...candidate.entries.keys()])){const a=current.entries.get(name),b=candidate.entries.get(name);if(a?.sha256!==b?.sha256||a?.size!==b?.size)changes.push({path:name,kind:!a?'added':!b?'removed':'modified',beforeSha256:a?.sha256??null,afterSha256:b?.sha256??null});}
 if(!changes.length)throw Error('upgrade_candidate_content_identical');
 // A structural preflight cannot certify migration SQL or restore compatibility.
 // 静态预检不证明迁移SQL语义或旧版本恢复兼容。
 const report={format:'enterprise-brain.upgrade-preflight/1',createdAt:new Date().toISOString(),status:'STATIC_ELIGIBLE_REHEARSAL_REQUIRED',current:{manifestSha256:current.manifestSha256,version:current.pkg.version,profile:current.manifest.profile,schemaFiles:current.migrations.length},candidate:{manifestSha256:candidate.manifestSha256,version:candidate.pkg.version,profile:candidate.manifest.profile,schemaFiles:candidate.migrations.length},publisherFingerprint:input.pinnedFingerprint,unchangedMigrationPrefix:current.migrations,appendedMigrations:candidate.migrations.slice(current.migrations.length),changes:changes.sort((a,b)=>a.path.localeCompare(b.path,'en')),dependencyLockChanged:current.entries.get('pnpm-lock.yaml').sha256!==candidate.entries.get('pnpm-lock.yaml').sha256,runtimeProfileChanged:current.manifest.profile!==candidate.manifest.profile,sameDeclaredVersion:current.pkg.version===candidate.pkg.version,candidateExecuted:false,databaseOpened:false,configurationRead:false,runningInstanceStopped:false,canCutover:false,rollbackProven:false,productionReady:false};
 return report;
}
export async function preflightUpgrade(inputFile,outputFile){
 const input=inputSchema.parse(json(await bounded(inputFile,16384)));
 if(!isAbsolute(outputFile)||resolve(outputFile)!==outputFile)throw Error('upgrade_absolute_path_required');await direct(dirname(outputFile),true);
 for(const root of [input.currentRoot,input.candidateRoot])for(const external of [inputFile,input.publicKeyFile,outputFile])if(inside(root,external))throw Error('upgrade_private_path_inside_installation');
 const report=await inspectUpgradeInstallations(input);
 await writeFile(outputFile,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--input'||args[2]!=='--out')throw Error('upgrade_usage_invalid');const report=await preflightUpgrade(args[1],args[3]);console.log(JSON.stringify({status:report.status,changedFiles:report.changes.length,appendedMigrations:report.appendedMigrations.length,candidateExecuted:false,canCutover:false}));}
 catch(e){console.error(JSON.stringify({code:/^(upgrade|release)_[a-z_]+$/.test(e?.message??'')?e.message:'upgrade_preflight_failed'}));process.exitCode=1;}
}
