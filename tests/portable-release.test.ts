// Portable profile rejects false runtime provenance before extraction.
// 便携通道在解包前拒绝伪造运行时来源。
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {safePath,encode,decode,fingerprint} from '../scripts/release.mjs';
import {validateRuntimeManifest,runtimeEntries,NODE_SHA256,NODE_LICENSE_SHA256} from '../scripts/portable-runtime.mjs';
const portable=()=>({profile:'local-windows-bundled-node24',node:'24.19.0',architecture:'x64',requiresExternalNode:false,entries:[{path:'runtime/node.exe',sha256:NODE_SHA256},{path:'runtime/LICENSE',sha256:NODE_LICENSE_SHA256}]});
test('E6 portable: only the exact runtime inventory is accepted',()=>{assert.equal(safePath('runtime/node.exe'),'runtime/node.exe');assert.equal(safePath('runtime/LICENSE'),'runtime/LICENSE');for(const p of ['runtime/other.exe','runtime/Node.exe','runtime/node.exe.config','runtime/x.dll','runtime/../node.exe'])assert.throws(()=>safePath(p));validateRuntimeManifest(portable());});
test('E6 portable: profile, version and runtime hash cannot be relabeled',()=>{for(const patch of [{node:'24.20.0'},{architecture:'arm64'},{requiresExternalNode:true},{profile:'local-windows-existing-node24'}])assert.throws(()=>validateRuntimeManifest({...portable(),...patch}));const p=portable();p.entries[0].sha256='0'.repeat(64);assert.throws(()=>validateRuntimeManifest(p),/release_runtime_manifest_invalid/);});
test('E6 portable: missing or additional runtime files are refused',()=>{const p=portable();assert.throws(()=>validateRuntimeManifest({...p,entries:p.entries.slice(0,1)}));assert.throws(()=>validateRuntimeManifest({...p,entries:[...p.entries,{path:'runtime/config',sha256:'0'.repeat(64)}]}));assert.throws(()=>validateRuntimeManifest({...p,entries:[null]}));});
test('E6 portable: a valid signer cannot omit the required upstream runtime',()=>{const pair=generateKeyPairSync('ed25519'),key=pair.publicKey.export({type:'spki',format:'pem'}),archive=encode([{path:'src/a.js',bytes:Buffer.from('owned example')}],{profile:'local-windows-bundled-node24',node:'24.19.0',architecture:'x64',requiresExternalNode:false},pair.privateKey);assert.throws(()=>decode(archive,key,fingerprint(key)),/release_runtime_manifest_invalid/);});
test('E6 portable: arbitrary runtime bytes are rejected at build',async()=>{const dir=await mkdtemp(join(tmpdir(),'eb-portable-')),nodePath=join(dir,'node.exe'),licensePath=join(dir,'LICENSE');await writeFile(nodePath,'not a runtime');await writeFile(licensePath,'not a license');await assert.rejects(runtimeEntries({nodePath,licensePath}),/runtime_source_hash_mismatch/);});
