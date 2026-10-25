// Local owner CLI, credentials never printed. / 本机所有者检查，凭证不回显。
import {readFile} from 'node:fs/promises';
import {localFetch as fetch} from './local-http.mjs';
import {ownsReadyPort} from './preflight.mjs';
async function readControl(){try{const c=JSON.parse(await readFile('.runtime/control.json','utf8'));if(!c||!Number.isInteger(c.port)||c.port<1024||c.port>65535||!/^[-_A-Za-z0-9]{43}$/.test(c.token??''))throw Error();return c;}catch{throw Error('本机控制状态无效 / Local control state invalid');}}
const control=await readControl(),origin='http://127.0.0.1:'+control.port;
if(!await ownsReadyPort(process.cwd(),control.port))throw Error('未确认本机实例归属 / Local instance ownership not verified');
const rechecked=await readControl();if(rechecked.port!==control.port||rechecked.token!==control.token)throw Error('本机实例已变更 / Local instance changed');
const response=await fetch(origin+'/_dev/it-session',{method:'POST',headers:{'X-Local-Control':control.token,Origin:origin},signal:AbortSignal.timeout(2000)});
if(!response.ok)throw Error('本机IT会话不可用 / Local IT session unavailable');
const cookie=response.headers.get('set-cookie')?.split(';')[0],context=await response.json();
const list=await fetch(origin+'/v1/it/connections',{headers:{Cookie:cookie},signal:AbortSignal.timeout(2000)});
if(!list.ok)throw Error('连接检查失败 / Connection check failed');
const connections=await list.json();
console.log(JSON.stringify({factKind:'constructed_actual',connections:connections.map(c=>({id:c.id,state:c.state,version:c.version,readEnabled:c.read_enabled,writeEnabled:c.write_enabled,driverVersion:c.driver_version,report:c.report}))},null,2));
