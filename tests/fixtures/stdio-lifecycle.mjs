// Owned child lifetime only,no external I/O or business execution.
// 仅自有子进程生命周期，无外部IO或业务执行。
import {writeFileSync} from 'node:fs';
const [marker,mode]=process.argv.slice(2);
writeFileSync(marker,JSON.stringify({pid:process.pid}));
const keepAlive=setInterval(()=>{},1000);process.stdin.resume();
process.stdin.once('end',()=>{if(mode==='graceful')setTimeout(()=>{clearInterval(keepAlive);writeFileSync(marker+'.closed','owned graceful close');},60);});
