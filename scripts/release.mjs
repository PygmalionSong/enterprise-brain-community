// Signed local candidate: explicit roots, copied packages and an optional pinned runtime.
// 签名本地候选包：显式范围、复制锁定包，可选准确核验的运行时，不含私人状态。
import {readFile,writeFile,readdir,mkdir,lstat,realpath,access} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,generateKeyPairSync,createPublicKey,sign,verify,randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {runtimeEntries,validateRuntimeManifest} from './portable-runtime.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const roots=['src','dist','data','migrations','scripts','licenses','tests'];
const documentNames=['NATIVE_UPGRADE','NATIVE_DBA_PREPARATION','NATIVE_BUDGET_PERIODS','NATIVE_AGENT_CONFIGURATION','NATIVE_BACKUP_RESTORE','NATIVE_MAINTENANCE','NATIVE_SERVICE','NATIVE_DEPLOYMENT','NATIVE_OWNERSHIP','NATIVE_HOST','NATIVE_RUNTIME','MANAGED_UPGRADE','UPGRADE_CONTROL','METADATA_LISTS','BUDGET_PERIODS','BUSINESS_HISTORY','BUSINESS_INFERENCE','BUSINESS_ANALYSIS','ANALYSIS_POLICY','BUSINESS_OBSERVATIONS','CANDIDATE_ADOPTION','CAPABILITIES','DATA_MODEL','THIRD_PARTY_NOTICES','UI_CONTRACT','RUNTIME_CORE','CONNECTION_CONTROL','WORKBENCH','DEPLOYMENT','RELEASE_PACKAGE','EVALUATION','ARCHITECTURE','DEMO_TOUR','MODEL_ADAPTERS','MANUAL_BASELINE','MOBILE_DELIVERY','PORTABLE_RELEASE','COMMUNITY','PERFORMANCE','SQL_CRM','ONBOARDING','SYNCHRONIZATION','SCHEDULING','PROCESS_METADATA','CUSTOMER_CASE','EVENT_INGRESS','FILE_IMPORTS','PROCESS_FOUNDATION','PRIVATE_OPERATIONS','GRAPH_RUNTIME','OPERATORS','ENTERPRISE_HOST','UPGRADES','MIGRATION_REHEARSAL','TRAFFIC','RECEIPT_RECOVERY','GRAPH_SUPERVISION','MCP_GRAPH_TOOLS','TOOL_CONTRACTS','PLANNING_STORAGE','PLANNING_CONTEXT','PLANNING_MODEL_CORE','MODELS'];
const documentFiles=[...documentNames.flatMap(n=>['docs/'+n+'.md','docs/'+n+'.en.md']),'docs/dependencies.json','docs/ui-baseline.json','docs/world-atlas-package.json'];
const singles=['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','LICENSE','NOTICE','README.md','README.en.md','CONTRIBUTING.md','CONTRIBUTING.en.md','SECURITY.md','SECURITY.en.md','.github/ISSUE_TEMPLATE/bug_report.yml','.github/ISSUE_TEMPLATE/feature_request.yml','.github/ISSUE_TEMPLATE/business_discussion.yml','.github/ISSUE_TEMPLATE/config.yml','.github/PULL_REQUEST_TEMPLATE.md','.gitignore','.dockerignore','Dockerfile','compose.yaml','Install-Docker.sh','Start-Local.cmd','Start-Release.cmd'];
const runtimeFiles=['runtime/node.exe','runtime/LICENSE'];
const ignored=new Set(['.git','.data','.runtime','.evidence','.cache']);
const maxBytes=320*1024*1024, maxFiles=10000;
const sha=b=>createHash('sha256').update(b).digest('hex');
const inside=(p,b)=>{const r=relative(b,p);return r!==''&&!r.startsWith('..')&&!isAbsolute(r);};
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
export function safePath(p){
 if(typeof p!=='string'||p.length>240||/[\\:<>"|?*\x00-\x1f]/.test(p)||p.split('/').some(s=>!s||s==='.'||s==='..'||/[. ]$/.test(s)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(s)))throw Error('release_path_denied');
 const parts=p.split('/'),head=parts[0];if(!roots.includes(head)&&head!=='node_modules'&&!singles.includes(p)&&!documentFiles.includes(p)&&!runtimeFiles.includes(p))throw Error('release_path_denied');
 if(parts.some(s=>ignored.has(s.toLowerCase())||/^\.env/i.test(s)||/^AGENTS(\.en)?\.md$/i.test(s))||/\.(pem|key|p12|pfx|ebbackup|ebrelease|log)$/i.test(p))throw Error('release_private_path_denied');return p;
}
export function fingerprint(publicKey){return sha(createPublicKey(publicKey).export({type:'spki',format:'der'}));}
export function encode(entries,metadata,privateKey){
 const manifest={format:1,profile:'local-windows-existing-node24',...metadata,entries:entries.map(({path,bytes})=>({path,size:bytes.length,sha256:sha(bytes)})).sort((a,b)=>a.path.localeCompare(b.path,'en'))};
 const manifestText=JSON.stringify(manifest),signature=sign(null,Buffer.from(manifestText),privateKey).toString('base64');
 const payload=gzipSync(Buffer.from(JSON.stringify(entries.map(({path,bytes})=>({path,data:bytes.toString('base64')})))));
 return {format:1,manifestText,signature,payload:payload.toString('base64')};
}
// Authenticate the exact manifest with an independently pinned key before decoding.
// 先用独立固定公钥验证准确清单，再解压并逐文件核验。
export function decode(archive,publicKey,expectedFingerprint){
 if(!/^[a-f0-9]{64}$/.test(expectedFingerprint??'')||fingerprint(publicKey)!==expectedFingerprint)throw Error('release_trust_mismatch');
 if(archive?.format!==1||typeof archive.manifestText!=='string'||archive.manifestText.length>8*1024*1024||typeof archive.signature!=='string'||!verify(null,Buffer.from(archive.manifestText),publicKey,Buffer.from(archive.signature,'base64')))throw Error('release_signature_invalid');
 const manifest=JSON.parse(archive.manifestText);if(manifest.format!==1||!['local-windows-existing-node24','local-windows-bundled-node24'].includes(manifest.profile)||!Array.isArray(manifest.entries)||manifest.entries.length>maxFiles)throw Error('release_manifest_invalid');
 validateRuntimeManifest(manifest);
 const expected=new Map(),folded=new Set();let total=0;
 for(const e of manifest.entries){safePath(e.path);const lower=e.path.toLowerCase();if(expected.has(e.path)||folded.has(lower))throw Error('release_duplicate_path');expected.set(e.path,e);folded.add(lower);if(!Number.isSafeInteger(e.size)||e.size<0||! /^[a-f0-9]{64}$/.test(e.sha256))throw Error('release_manifest_invalid');total+=e.size;}
 if(total>maxBytes)throw Error('release_size_limit');
 for(const path of folded){let parent=path;while(parent.includes('/')){parent=parent.slice(0,parent.lastIndexOf('/'));if(folded.has(parent))throw Error('release_path_conflict');}}
 let payload;try{if(typeof archive.payload!=='string'||archive.payload.length>maxBytes*2)throw Error();payload=JSON.parse(gunzipSync(Buffer.from(archive.payload,'base64'),{maxOutputLength:maxBytes*2}).toString());}catch{throw Error('release_payload_invalid');}
 if(!Array.isArray(payload)||payload.length!==expected.size)throw Error('release_inventory_mismatch');const seen=new Set(),entries=[];
 for(const item of payload){safePath(item.path);if(seen.has(item.path)||!expected.has(item.path))throw Error('release_inventory_mismatch');seen.add(item.path);const e=expected.get(item.path);if(typeof item.data!=='string')throw Error('release_payload_invalid');const bytes=Buffer.from(item.data,'base64');if(bytes.length!==e.size||sha(bytes)!==e.sha256)throw Error('release_file_integrity_failed');entries.push({path:item.path,bytes});}
 return {manifest,entries};
}
async function readArchive(file){if((await lstat(file)).size>maxBytes*2)throw Error('release_size_limit');return JSON.parse(await readFile(file,'utf8'));}
async function collectDirectory(dir,prefix,entries,limitRoot){
 const actual=await realpath(dir);if(actual!==limitRoot&&!inside(actual,limitRoot))throw Error('release_source_escape');
 for(const e of await readdir(dir,{withFileTypes:true})){const p=prefix+'/'+e.name;safePath(p);if(e.isSymbolicLink())throw Error('release_symlink_denied');if(e.isDirectory()){if(e.name==='node_modules'&&prefix.startsWith('node_modules/'))continue;await collectDirectory(join(dir,e.name),p,entries,limitRoot);}else if(e.isFile())entries.push({path:p,bytes:await readFile(join(dir,e.name))});else throw Error('release_file_type_denied');}
}
async function packageDirectory(name,from){
 let p=from;while(true){const candidate=join(p,'node_modules',name);if(await exists(join(candidate,'package.json')))return realpath(candidate);const parent=dirname(p);if(parent===p)break;p=parent;}throw Error('release_dependency_missing:'+name);
}
export async function collectProduct(){
 const entries=[],productRoot=await realpath(root);
 for(const p of [...singles,...documentFiles]){const target=join(root,p);if((await lstat(target)).isSymbolicLink())throw Error('release_symlink_denied');entries.push({path:p,bytes:await readFile(target)});}
 for(const p of roots)await collectDirectory(join(root,p),p,entries,productRoot);
 // Dependencies are flattened only when every installed name has one version.
 // 仅在安装图的每个包名都对应同一版本时平铺，冲突时停止打包。
 const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8')),packages=new Map(),dependencyRoot=await realpath(join(root,'node_modules'));
 async function visit(name,from,optional=false){
  let dir;try{dir=await packageDirectory(name,from);}catch(e){if(optional)return;throw e;}if(!inside(dir,dependencyRoot))throw Error('release_dependency_escape');
  const info=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));if(info.name!==name)throw Error('release_dependency_identity');
  const prior=packages.get(name);if(prior){if(prior.version!==info.version||prior.dir!==dir)throw Error('release_dependency_version_conflict:'+name);return;}
  packages.set(name,{name,version:info.version,license:info.license??'UNDECLARED',dir});
  for(const dep of Object.keys(info.dependencies??{}))await visit(dep,dir);
  for(const dep of Object.keys(info.optionalDependencies??{}))await visit(dep,dir,true);
  for(const dep of Object.keys(info.peerDependencies??{}))await visit(dep,dir,info.peerDependenciesMeta?.[dep]?.optional===true);
 }
 for(const name of Object.keys({...pkg.dependencies,...pkg.devDependencies}))await visit(name,root);
 for(const p of packages.values())await collectDirectory(p.dir,'node_modules/'+p.name,entries,p.dir);
 return {entries,packages:[...packages.values()].map(({dir,...p})=>p).sort((a,b)=>a.name.localeCompare(b.name,'en')),version:pkg.version};
}
export async function pack(options={}){
 if(process.platform!=='win32'||process.arch!=='x64'||process.versions.node!=='24.19.0')throw Error('release_builder_profile_unverified');
 const {entries,packages,version}=await collectProduct();
 if(options.runtime)entries.push(...await runtimeEntries(options.runtime));
 const keyDir=join(root,'.data/release-signing');await mkdir(keyDir,{recursive:true});
 if(!inside(await realpath(keyDir),await realpath(root)))throw Error('release_signing_path_denied');
 const privateFile=join(keyDir,'local-ed25519.pem'),publicFile=join(keyDir,'local-ed25519.public.pem');
 for(const file of [privateFile,publicFile])if(await exists(file)&&(await lstat(file)).isSymbolicLink())throw Error('release_signing_path_denied');
 if(!await exists(privateFile)&&!await exists(publicFile)){const pair=generateKeyPairSync('ed25519');await writeFile(privateFile,pair.privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:0o600});await writeFile(publicFile,pair.publicKey.export({type:'spki',format:'pem'}),{flag:'wx',mode:0o600});}
 const privateKey=await readFile(privateFile),publicKey=await readFile(publicFile),id=randomUUID();
 const profile=options.runtime?'local-windows-bundled-node24':'local-windows-existing-node24';
 const archive=encode(entries,{id,version,createdAt:new Date().toISOString(),profile,node:'24.19.0',architecture:'x64',packages,requiresExternalNode:!options.runtime,linuxVerified:false,publicationCleared:false,modelMode:'mock-and-finite-rules',dataMode:'constructed'},privateKey);
 decode(archive,publicKey,fingerprint(publicKey));
 const dir=join(root,'.evidence/release-candidates');await mkdir(dir,{recursive:true});const file=join(dir,id+'.ebrelease');await writeFile(file,JSON.stringify(archive),{flag:'wx'});
 const trustFile=join(dir,id+'.public.pem');await writeFile(trustFile,publicKey,{flag:'wx'});
 return {id,file,trustFile,trustFingerprint:fingerprint(publicKey),profile,files:entries.length,bytes:entries.reduce((n,e)=>n+e.bytes.length,0),archiveBytes:(await lstat(file)).size,packages:packages.length,requiresExternalNode:!options.runtime,linuxVerified:false,published:false};
}
export async function unpack(file,publicFile,pin,target){
 const archive=await readArchive(file),publicKey=await readFile(publicFile),verified=decode(archive,publicKey,pin),destination=resolve(target);
 // A new child of an existing real directory; never overwrite or follow junctions.
 // 仅写既有真实目录的新子目录，不覆盖，不穿越目录联接。
 if(await exists(destination))throw Error('release_target_exists');const parent=dirname(destination);if(resolve(await realpath(parent)).toLowerCase()!==parent.toLowerCase())throw Error('release_target_symlink_denied');
 await mkdir(destination,{recursive:false});
 for(const e of verified.entries){const out=join(destination,e.path);await mkdir(dirname(out),{recursive:true});await writeFile(out,e.bytes,{flag:'wx'});}
 await writeFile(join(destination,'RELEASE.json'),JSON.stringify({format:1,manifestText:archive.manifestText,signature:archive.signature}),{flag:'wx'});
 return {target:destination,files:verified.entries.length,version:verified.manifest.version,verified:true};
}
export async function verifyTree(directory,publicFile,pin){
 const dir=resolve(directory),publicKey=await readFile(publicFile),signed=JSON.parse(await readFile(join(dir,'RELEASE.json'),'utf8'));
 if(!/^[a-f0-9]{64}$/.test(pin??'')||fingerprint(publicKey)!==pin)throw Error('release_trust_mismatch');
 if(signed.format!==1||typeof signed.manifestText!=='string'||!verify(null,Buffer.from(signed.manifestText),publicKey,Buffer.from(signed.signature,'base64')))throw Error('release_signature_invalid');
 const manifest=JSON.parse(signed.manifestText),expected=new Map();if(manifest.format!==1||!['local-windows-existing-node24','local-windows-bundled-node24'].includes(manifest.profile)||!Array.isArray(manifest.entries)||manifest.entries.length>maxFiles)throw Error('release_manifest_invalid');
 validateRuntimeManifest(manifest);
 const fold=new Set();for(const e of manifest.entries){safePath(e.path);if(fold.has(e.path.toLowerCase()))throw Error('release_duplicate_path');fold.add(e.path.toLowerCase());expected.set(e.path,e);}
 const found=[];async function walk(p,prefix=''){for(const e of await readdir(p,{withFileTypes:true})){const name=prefix?prefix+'/'+e.name:e.name;if(!prefix&&(ignored.has(e.name)||e.name==='RELEASE.json'))continue;if(e.isSymbolicLink())throw Error('release_symlink_denied');if(e.isDirectory())await walk(join(p,e.name),name);else if(e.isFile()){safePath(name);const exp=expected.get(name);if(!exp)throw Error('release_unlisted_file');const bytes=await readFile(join(p,e.name));if(exp.size!==bytes.length||exp.sha256!==sha(bytes))throw Error('release_file_integrity_failed');found.push(name);}else throw Error('release_file_type_denied');}}
 await walk(dir);if(found.length!==expected.size)throw Error('release_inventory_mismatch');return {verified:true,files:found.length,version:manifest.version};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [command,...args]=process.argv.slice(2);let result;if(command==='pack')result=await pack();else if(command==='verify'){const v=decode(await readArchive(args[0]),await readFile(args[1]),args[2]);result={verified:true,files:v.entries.length,version:v.manifest.version};}else if(command==='unpack')result=await unpack(...args);else if(command==='verify-tree')result=await verifyTree(...args);else throw Error('usage: pack | verify <archive> <public-key> <trusted-fingerprint> | unpack <archive> <public-key> <trusted-fingerprint> <new-directory> | verify-tree <directory> <public-key> <trusted-fingerprint>');console.log(JSON.stringify(result));}catch(e){console.error('发行操作未完成 / Release operation incomplete: '+e.message);process.exitCode=1;}
}





