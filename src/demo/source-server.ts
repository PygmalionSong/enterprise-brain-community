// Child-process fixture; source credential is inherited privately, never printed.
// 子进程合成源，凭证通过私有环境继承，不打印。
import {resolve} from 'node:path';
import {openDatabase} from '../db/adapter.ts';
import {readCase} from '../industry/seed.ts';
import {createSyntheticSource} from './source.ts';
const secret=process.env.EB_SOURCE_SECRET;if(!secret)throw Error('missing_source_secret');
const db=await openDatabase(resolve('.data/source-http')),scenario=(await readCase(process.cwd())).scenario;
const {server,operating}=await createSyntheticSource(db,secret,scenario.skus,true);
server.listen(0,'127.0.0.1',()=>process.send?.({port:(server.address() as any).port}));
let stopping=false;async function stop(){if(stopping)return;stopping=true;server.close(async()=>{await operating.stop();await db.close();process.exit(0);});}
process.on('message',message=>{if(message==='stop')void stop();});process.on('disconnect',()=>void stop());
process.on('SIGTERM',()=>void stop());
