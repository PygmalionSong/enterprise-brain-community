// Explicit owned-fixture entry; no enterprise endpoint or model key is accepted.
// 显式自有夹具入口；不接收企业端点或模型密钥。
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath}from'node:url';import {randomBytes,randomUUID}from'node:crypto';import readline from'node:readline';
import {openDatabase}from'../src/db/adapter.ts';import {migrate}from'../src/db/migrate.ts';import {seed,readCase}from'../src/industry/seed.ts';import {initializeWorkbench}from'../src/core/workbench.ts';import {createApplication}from'../src/http/server.ts';import {startRuntime}from'../src/runtime/host.ts';
const root=fs.realpathSync(fileURLToPath(new URL('..',import.meta.url)));process.chdir(root);
if(process.versions.node.split('.')[0]!=='24')throw Error('Node24 required / 需要Node24 / Node24が必要です');
if(process.argv.slice(2).length!==1||process.argv[2]!=='--acknowledge-owned-fixture')throw Error('Use --acknowledge-owned-fixture / 请明确确认构造环境 / 構成環境への同意が必要です');
if(process.env.DATABASE_URL||process.env.EB_MODE&&process.env.EB_MODE!=='demo')throw Error('Reference entry refuses enterprise configuration / 参考入口拒绝企业配置 / 参照環境は企業設定を受け付けません');
for(const file of['dist/web/app.js','dist/web/style.css','dist/demo-source.js'])if(!fs.existsSync(file))throw Error('Run the documented build first / 请先按指南构建 / 先にビルドしてください');
const dir=path.join(root,'.data'),ownerFile=path.join(dir,'reference-owner.json');
if(fs.existsSync(dir)){
 if(!fs.existsSync(ownerFile))throw Error('Existing unowned data is not a reference workspace / 既有数据不属于此参考环境 / 所有未確認の既存データです');
 const owner=JSON.parse(fs.readFileSync(ownerFile));if(owner.format!=='enterprise-brain.owned-reference/1'||owner.root!==root)throw Error('Reference ownership mismatch / 参考环境归属不一致 / 参照環境の所有が一致しません');
}else{fs.mkdirSync(dir);fs.writeFileSync(ownerFile,JSON.stringify({format:'enterprise-brain.owned-reference/1',root}),{flag:'wx',mode:0o600});}
const instanceId=randomUUID(),token=randomBytes(32).toString('base64url'),lock=path.join(dir,'reference.lock');let db,host,server,stopping=false;
fs.writeFileSync(lock,JSON.stringify({instanceId,pid:process.pid}),{flag:'wx',mode:0o600});
function releaseLock(){if(fs.existsSync(lock)&&JSON.parse(fs.readFileSync(lock)).instanceId===instanceId)fs.unlinkSync(lock);}
async function stop(){if(stopping)return;stopping=true;if(server?.listening)await new Promise(ok=>server.close(ok));await host?.stop();await db?.close();releaseLock();console.log('Reference stopped; local data retained / 已停止并保留本地数据 / 停止しローカルデータを保持');process.exit(0);}
try{
 db=await openDatabase(path.join(dir,'reference-main'));await migrate(db,path.join(root,'migrations'));await seed(db,root);await initializeWorkbench(db,root);host=await startRuntime(db,root);
 const application=createApplication(db,root,'demo',{token,instanceId,stop:()=>void stop()},(await readCase(root)).scenario.sources,host.runtime,host.connections,host.operating,host.events);server=application.server;
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});host.start();
 const url='http://127.0.0.1:'+server.address().port+'/';fs.writeFileSync(path.join(dir,'reference-instance.json'),JSON.stringify({instanceId,pid:process.pid,url}),{mode:0o600});
 console.log(JSON.stringify({application:'enterprise-brain-owned-reference',instanceId,url,constructedSystems:true,persistedBackend:true,liveModel:false,realEnterprise:false}));
 console.log('Stop: Ctrl+C or type stop / 停止：Ctrl+C或输入stop / 停止：Ctrl+Cまたはstop');
 readline.createInterface({input:process.stdin}).on('line',line=>{if(line==='stop')void stop();});process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
}catch(e){if(server?.listening)await new Promise(ok=>server.close(ok));await host?.stop();await db?.close();releaseLock();throw e;}
