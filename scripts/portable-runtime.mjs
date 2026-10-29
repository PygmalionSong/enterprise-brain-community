// Exact upstream runtime pins; Windows behavior remains separate from Linux.
// 准确上游运行时摘要；Windows与Linux配置分别校验。
import {readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const NODE_VERSION='24.19.0';
export const NODE_SHA256='3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237';
export const NODE_LINUX_SHA256='bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12';
export const NODE_LICENSE_SHA256='148eacf7863ef4329224a29398623077200a27194aa075569faf4a0a85566ca5';
export const NODE_CHECKSUM_URL='https://nodejs.org/download/release/v24.19.0/SHASUMS256.txt';
export const NODE_LICENSE_URL='https://raw.githubusercontent.com/nodejs/node/v24.19.0/LICENSE';
export const RELEASE_PROFILES=Object.freeze(['local-windows-existing-node24','local-windows-bundled-node24','local-linux-existing-node24','local-linux-bundled-node24']);
export function validateRuntimeManifest(manifest){
 if(!RELEASE_PROFILES.includes(manifest.profile)||!Array.isArray(manifest.entries)||manifest.entries.some(e=>!e||typeof e.path!=='string'))throw Error('release_manifest_invalid');
 const linux=manifest.profile.startsWith('local-linux-'),portable=manifest.profile.endsWith('-bundled-node24');
 if(linux&&manifest.entries.some(e=>![0o644,0o755].includes(e.mode)))throw Error('release_file_mode_invalid');
 if(!portable){if(manifest.entries.some(e=>e.path.startsWith('runtime/')))throw Error('release_runtime_profile_mismatch');return;}
 if(manifest.node!==NODE_VERSION||manifest.architecture!=='x64'||manifest.requiresExternalNode!==false)throw Error('release_runtime_profile_mismatch');
 const runtime=manifest.entries.filter(e=>e.path.startsWith('runtime/')),binary=linux?'runtime/node':'runtime/node.exe',pin=linux?NODE_LINUX_SHA256:NODE_SHA256;
 if(runtime.length!==2||runtime.find(e=>e.path===binary)?.sha256!==pin||runtime.find(e=>e.path==='runtime/LICENSE')?.sha256!==NODE_LICENSE_SHA256||linux&&runtime.find(e=>e.path===binary)?.mode!==0o755)throw Error('release_runtime_manifest_invalid');
}
export async function runtimeEntries({nodePath,licensePath,platform='win32'}){
 if(!['win32','linux'].includes(platform))throw Error('runtime_platform_unqualified');
 const linux=platform==='linux',entries=[];
 for(const [file,path,pin,max,mode] of [[nodePath,linux?'runtime/node':'runtime/node.exe',linux?NODE_LINUX_SHA256:NODE_SHA256,128*1024*1024,0o755],[licensePath,'runtime/LICENSE',NODE_LICENSE_SHA256,1024*1024,0o644]]){
  const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)throw Error('runtime_source_denied');const bytes=await readFile(file);
  if(createHash('sha256').update(bytes).digest('hex')!==pin)throw Error('runtime_source_hash_mismatch');entries.push({path,bytes,...(linux?{mode}:{})});
 }
 return entries;
}
