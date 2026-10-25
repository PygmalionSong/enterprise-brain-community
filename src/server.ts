import { openDatabase } from './db/adapter.ts';
import {serverDatabaseLocation} from './db/location.ts';
import { migrate } from './db/migrate.ts';
import { seed, readCase } from './industry/seed.ts';
import { createApplication } from './http/server.ts';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import {initializeWorkbench} from './core/workbench.ts';
import { startRuntime } from './runtime/host.ts';
const root=process.cwd(),mode=process.env.EB_MODE??'demo';
if(mode!=='demo')throw new Error('enterprise_mode_not_enabled');
const port=Number(process.env.PORT??4318);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('invalid_port');
await mkdir(resolve(root,'.data'),{recursive:true});
const db=await openDatabase(serverDatabaseLocation(root,process.env));
try {await migrate(db,resolve(root,'migrations'));await seed(db,root);await initializeWorkbench(db,root);}catch(e){await db.close();throw e;}
const allocations=(await readCase(root)).scenario.sources;
const runtimeHost=await startRuntime(db,root).catch(async e=>{await db.close();throw e;});
let stopping=false;
const {server}=createApplication(db,root,mode,process.env.EB_CONTROL_TOKEN?{token:process.env.EB_CONTROL_TOKEN,instanceId:process.env.EB_INSTANCE_ID,stop:()=>void stop()}:undefined,allocations,runtimeHost.runtime,runtimeHost.connections,runtimeHost.operating,runtimeHost.events);
server.listen(port,process.env.EB_CONTAINER==='1'?'0.0.0.0':'127.0.0.1',()=>{runtimeHost.start();console.log(JSON.stringify({status:'ready',url:`http://127.0.0.1:${port}`,database:db.profile,mode}));});
server.on('error',async e=>{console.error('启动失败 / Start failed:',(e as NodeJS.ErrnoException).code??'server_error');await runtimeHost.stop();await db.close();process.exitCode=1;});
async function stop(){if(stopping)return;stopping=true;server.close(async()=>{await runtimeHost.stop();await db.close();process.exit(0);});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
