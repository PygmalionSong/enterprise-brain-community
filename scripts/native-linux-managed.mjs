// Explicit native CLI supervision; fixed entry points only, no background scheduler.
// 显式原生CLI服务管理，仅固定入口，不创建后台调度。
import {spawn} from 'node:child_process';
import {dirname,join} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {captureLinuxPrimary,linuxManagerEnvironment} from '../src/platform/linux-systemd.ts';
export async function manageNativeLinuxCLI(entry,args,eligible){
 if(process.platform!=='linux'||!eligible)return null;
 if(!['enterprise-native.mjs','native-upgrade.mjs'].includes(entry))throw Error('native_linux_entry_invalid');
 try{await captureLinuxPrimary();return null;}catch(e){if(e.message!=='native_linux_primary_required')throw e;}
 const root=join(dirname(fileURLToPath(import.meta.url)),'..'),unit='enterprise-brain-runtime-'+randomUUID()+'.service';
 const command=['--user','--quiet','--pipe','--wait','--collect','--service-type=exec','--unit='+unit,'--property=ExitType=main','--property=KillMode=control-group','--property=KillSignal=SIGKILL','--property=Restart=no','--property=UnsetEnvironment=NODE_OPTIONS NODE_PATH LD_PRELOAD LD_LIBRARY_PATH','--expand-environment=no','/usr/bin/env','-i','PATH=/usr/bin:/bin','HOME='+homedir(),process.execPath,join(root,'scripts',entry),...args];
 const bridge=spawn('/usr/bin/systemd-run',command,{cwd:root,env:linuxManagerEnvironment(),stdio:'inherit'});return new Promise(ok=>{bridge.once('error',()=>ok(1));bridge.once('close',code=>ok(code??1));});
}
