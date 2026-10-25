// Private localhost control requires lock/health identity before sending the key.
// 私人本机控制：发送密钥前核对锁文件与健康标识，并限制等待时间。
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {localFetch,readLocalJSON} from './local-http.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
async function optionalJSON(file){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw Error('local_control_invalid_state');}}
async function state(root){
 const lock=await optionalJSON(join(root,'.runtime/instance.lock')),control=await optionalJSON(join(root,'.runtime/control.json'));
 if(!lock&&!control)return null;
 if(!lock||!control||!Number.isInteger(lock.pid)||lock.pid<1||!Number.isInteger(lock.port)||lock.port<1024||lock.port>65535||!uuid.test(lock.instanceId??'')||control.port!==lock.port||!/^[-_A-Za-z0-9]{43}$/.test(control.token??''))throw Error('local_control_invalid_state');
 try{process.kill(lock.pid,0);}catch{throw Error('local_control_stale_lock');}
 return {lock,control};
}
async function health(port,timeoutMs){
 const response=await localFetch('http://127.0.0.1:'+port+'/health',{redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
 return readLocalJSON(response,16384);
}
export async function stopOwnedLocal(root,{healthTimeoutMs=2000,shutdownTimeoutMs=20000}={}){
 if(!Number.isInteger(healthTimeoutMs)||healthTimeoutMs<10||healthTimeoutMs>5000||!Number.isInteger(shutdownTimeoutMs)||shutdownTimeoutMs<10||shutdownTimeoutMs>30000)throw Error('local_control_timeout_invalid');
 const current=await state(root);if(!current)return {stopped:true,requested:false};
 let h;try{h=await health(current.lock.port,healthTimeoutMs);}catch{throw Error('local_control_health_denied');}
 if(h.application!=='enterprise-brain'||h.status!=='ready'||h.instanceId!==current.lock.instanceId)throw Error('local_control_identity_mismatch');
 const rechecked=await state(root);
 if(!rechecked||JSON.stringify(rechecked)!==JSON.stringify(current))throw Error('local_control_instance_changed');
 let response;try{response=await localFetch('http://127.0.0.1:'+current.lock.port+'/_dev/stop',{method:'POST',headers:{'X-Local-Control':current.control.token},redirect:'error',signal:AbortSignal.timeout(healthTimeoutMs)});}catch{throw Error('local_control_shutdown_unconfirmed');}
 await response.body?.cancel().catch(()=>{});if(!response.ok)throw Error('local_control_shutdown_denied');
 const deadline=Date.now()+shutdownTimeoutMs;
 while(Date.now()<deadline){const lock=await optionalJSON(join(root,'.runtime/instance.lock'));if(!lock){if(await optionalJSON(join(root,'.runtime/control.json'))) {await new Promise(ok=>setTimeout(ok,50));continue;}return {stopped:true,requested:true,instanceId:current.lock.instanceId};}if(lock.instanceId!==current.lock.instanceId||lock.pid!==current.lock.pid||lock.port!==current.lock.port)throw Error('local_control_instance_changed');await new Promise(ok=>setTimeout(ok,50));}
 throw Error('local_control_shutdown_timeout');
}
