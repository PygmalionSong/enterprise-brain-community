// Local constructed-case control, never prints session or CSRF tokens.
// 本机构造案例控制，不输出会话或CSRF凭证。
import {randomUUID} from 'node:crypto';
import {localFetch as fetch} from './local-http.mjs';
const base='http://127.0.0.1:'+Number(process.env.PORT??4318),operation=process.argv[2]??'create',runId=process.argv[3];
const page=await fetch(base+'/'),cookie=page.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw Error('Local session unavailable / 本机会话不可用');
const context=await fetch(base+'/v1/context',{headers:{Cookie:cookie}}).then(r=>r.json());if(!context.csrf)throw Error('Runtime not enabled / 运行核心未启动');
async function api(path,body){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:base,'X-CSRF-Token':context.csrf,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:body?JSON.stringify(body):undefined});const result=await response.json();if(!response.ok)throw Error(result.code??'request_failed');return result;}
let result;
if(operation==='create')result=await api('/v1/cases/SUPPLY-20261012/runs',{kind:'supply',cashBudgetCny:60_000_000});
else{
 if(!/^[a-f0-9-]{36}$/.test(runId??''))throw Error('Run UUID required / 需要任务UUID');
 if(operation==='status')result=await api('/v1/runs/'+runId);
 else if(operation==='events')result=await api('/v1/runs/'+runId+'/events');
 else if(operation==='approve'){const run=await api('/v1/runs/'+runId),plan=run.plans.at(-1);if(!plan)throw Error('Plan is not ready / 方案尚未就绪');result=await api('/v1/plans/'+plan.id+'/approvals',{expected_version:plan.version,decision:'approve'});}
 else if(operation==='fulfill')result=await api('/v1/dev/runtime/'+runId+'/fulfill',{});
 else if(['pause','resume','cancel'].includes(operation)){const run=await api('/v1/runs/'+runId);result=await api('/v1/runs/'+runId+'/'+operation,{expected_version:run.version,reason:'Local constructed-case control / 本机构造案例控制'});}
 else throw Error('Unknown operation / 未知操作');
}
console.log(JSON.stringify(result,null,2));
