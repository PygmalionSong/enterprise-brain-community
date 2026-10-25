// Local-only portable export; no download, remote creation or publication.
// 本地便携包导出，不下载、不创建远程、不发布。
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {pack,unpack,verifyTree} from './release.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex');
export async function packPortable(runtime){
 const candidate=await pack({runtime}),parent=join(root,'.evidence/portable-candidates');await mkdir(parent,{recursive:true});
 const target=join(parent,candidate.id);await mkdir(target,{recursive:false});const installed=await unpack(candidate.file,candidate.trustFile,candidate.trustFingerprint,join(target,'app'));
 const verifier=await readFile(join(root,'dist/release-verifier.mjs'));
 await writeFile(join(target,'release-verifier.mjs'),verifier,{flag:'wx'});
 await copyFile(candidate.trustFile,join(target,'release-public.pem'));
 const template=await readFile(join(root,'scripts/start-portable.ps1'),'utf8'),launcher=template.replace('__VERIFIER_SHA256__',sha(verifier)).replace('__SIGNER_SHA256__',candidate.trustFingerprint);
 await writeFile(join(target,'Launch.ps1'),'\uFEFF'+launcher,{flag:'wx'});await copyFile(join(root,'scripts/start-portable.cmd'),join(target,'Launch.cmd'));
 for(const suffix of ['','.en'])await copyFile(join(root,'docs/PORTABLE_RELEASE'+suffix+'.md'),join(target,'README'+suffix+'.md'));
 const tree=await verifyTree(installed.target,candidate.trustFile,candidate.trustFingerprint);
 const outerManifest=[];for(const file of ['release-verifier.mjs','release-public.pem','Launch.ps1','Launch.cmd','README.md','README.en.md'])outerManifest.push({path:file,sha256:sha(await readFile(join(target,file)))});
 const record={...candidate,target,app:installed.target,tree,outerManifest,requiresSystemNode:false,cleanHostVerified:false,published:false};await writeFile(join(root,'.evidence/portable-latest.json'),JSON.stringify(record,null,2));return record;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const result=await packPortable({nodePath:process.argv[2],licensePath:process.argv[3]});console.log(JSON.stringify({id:result.id,target:result.target,files:result.files,requiresSystemNode:false,published:false}));}catch(e){console.error('Portable export incomplete / 便携导出未完成: '+e.message);process.exitCode=1;}}
