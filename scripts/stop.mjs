// Graceful local shutdown; no external process termination. / 正常停止本机服务，不结束外部进程。
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stopOwnedLocal } from './local-control.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
try{await stopOwnedLocal(root);console.log('本机实例已停止 / Local instance stopped');}
catch(e){console.error('停服未完成 / Shutdown incomplete: '+e.message);process.exitCode=1;}
