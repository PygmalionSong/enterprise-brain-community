// Exact reviewed upstream runtime, never an arbitrary executable.
// 仅接受已核对的上游准确运行时，不接受任意可执行文件。
import {readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const NODE_VERSION='24.19.0';
export const NODE_SHA256='3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237';
export const NODE_LICENSE_SHA256='148eacf7863ef4329224a29398623077200a27194aa075569faf4a0a85566ca5';
export const NODE_CHECKSUM_URL='https://nodejs.org/download/release/v24.19.0/SHASUMS256.txt';
export const NODE_LICENSE_URL='https://raw.githubusercontent.com/nodejs/node/v24.19.0/LICENSE';
export function validateRuntimeManifest(manifest){
 if(!['local-windows-existing-node24','local-windows-bundled-node24'].includes(manifest.profile)||!Array.isArray(manifest.entries)||manifest.entries.some(e=>!e||typeof e.path!=='string'))throw Error('release_manifest_invalid');
 const portable=manifest.profile==='local-windows-bundled-node24';
 if(!portable){if(manifest.entries.some(e=>e.path.startsWith('runtime/')))throw Error('release_runtime_profile_mismatch');return;}
 if(manifest.node!==NODE_VERSION||manifest.architecture!=='x64'||manifest.requiresExternalNode!==false)throw Error('release_runtime_profile_mismatch');
 const runtime=manifest.entries.filter(e=>e.path.startsWith('runtime/'));
 if(runtime.length!==2||runtime.find(e=>e.path==='runtime/node.exe')?.sha256!==NODE_SHA256||runtime.find(e=>e.path==='runtime/LICENSE')?.sha256!==NODE_LICENSE_SHA256)throw Error('release_runtime_manifest_invalid');
}
export async function runtimeEntries({nodePath,licensePath}){
 const entries=[];
 for(const [file,path,pin,max] of [[nodePath,'runtime/node.exe',NODE_SHA256,128*1024*1024],[licensePath,'runtime/LICENSE',NODE_LICENSE_SHA256,1024*1024]]){
  const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)throw Error('runtime_source_denied');const bytes=await readFile(file);
  if(createHash('sha256').update(bytes).digest('hex')!==pin)throw Error('runtime_source_hash_mismatch');entries.push({path,bytes});
 }
 return entries;
}
