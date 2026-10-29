import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonicalPathEqual,canonicalPathKey} from '../src/platform/canonical-path.ts';
import {readPrivateJson} from '../src/enterprise/configuration.ts';
import {nativeAdoptionClaimPath} from '../src/enterprise/native-configuration.ts';

test('path identity preserves Windows folding and exact Linux/Unix paths',()=>{
 assert.equal(canonicalPathEqual('C:\\Private','c:\\private','win32'),true);
 for(const platform of ['linux','darwin','freebsd'] as const){
  assert.equal(canonicalPathEqual('/Private','/private',platform),false);
  assert.equal(canonicalPathEqual('/私有 $ 目录','/私有 $ 目录',platform),true);
  assert.notEqual(canonicalPathKey('/A',platform),canonicalPathKey('/a',platform));
  assert.equal(canonicalPathEqual('/é','/e\u0301',platform),false);
 }
});

test('private JSON rejects a case-only indirect ancestor on Linux',{skip:process.platform!=='linux'},async()=>{
 const base=await mkdtemp(join(tmpdir(),'enterprise-case-'));
 try{
  const direct=join(base,'private'),alias=join(base,'PRIVATE');
  await mkdir(join(direct,'nested'),{recursive:true,mode:0o700});
  await writeFile(join(direct,'nested','owned.json'),JSON.stringify({owned:true}),{mode:0o600});
  await symlink(direct,alias,'dir');
  assert.deepEqual(await readPrivateJson(join(direct,'nested','owned.json')),{owned:true});
  await assert.rejects(readPrivateJson(join(alias,'nested','owned.json')),/enterprise_private_path_indirect/);
  assert.notEqual(nativeAdoptionClaimPath(join(direct,'config.json')),nativeAdoptionClaimPath(join(alias,'config.json')));
 }finally{await rm(base,{recursive:true,force:true});}
});

test('two actual Linux directories differing only in case retain separate claim identities',{skip:process.platform!=='linux'},async()=>{
 const base=await mkdtemp(join(tmpdir(),'enterprise-case-'));
 try{
  for(const name of ['Private','private'])await mkdir(join(base,name),{mode:0o700});
  const upper=nativeAdoptionClaimPath(join(base,'Private','config.json')),lower=nativeAdoptionClaimPath(join(base,'private','config.json'));
  assert.notEqual(upper,lower);
 }finally{await rm(base,{recursive:true,force:true});}
});
