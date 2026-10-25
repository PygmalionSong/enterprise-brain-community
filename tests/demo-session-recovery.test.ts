// Reference entry can recover its own demo session; authenticated APIs never mint identity.
// 参考入口可恢复自身演示会话，受保护API绝不自动授予身份。
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {request} from 'node:http';
import {openDatabase,type Database} from '../src/db/adapter.ts';
import {migrate} from '../src/db/migrate.ts';
import {seed,DEMO_ENTERPRISE,DEMO_EXECUTIVE} from '../src/industry/seed.ts';
import {digest} from '../src/identity/service.ts';
import {createApplication} from '../src/http/server.ts';
let db:Database,url:string,app:ReturnType<typeof createApplication>;
const itId=randomUUID();
before(async()=>{db=await openDatabase(':memory:');await migrate(db,'migrations');await seed(db,process.cwd());await db.query("INSERT INTO principal(id,enterprise_id,username,role) VALUES($1,$2,'session-recovery-it','it')",[itId,DEMO_ENTERPRISE]);app=createApplication(db,process.cwd());await new Promise<void>(ok=>app.server.listen(0,'127.0.0.1',ok));url=`http://127.0.0.1:${(app.server.address() as any).port}`;});
after(async()=>{await new Promise<void>(ok=>app.server.close(()=>ok()));await db.close();});
const cookie=(token:string)=>'eb_session='+token;
async function context(value:string){const response=await fetch(url+'/v1/context',{headers:{Cookie:value}});return {status:response.status,body:await response.json()};}
function replacement(response:Response){const header=response.headers.get('set-cookie');assert.ok(header,'Reference entry must replace an unusable demo cookie');assert.ok(header.includes('HttpOnly')&&header.includes('SameSite=Strict')&&header.includes('Path=/'));return header.split(';')[0];}

test('reference recovery: foreign/unknown demo cookie loads a fresh executive session; old token remains denied',async()=>{const old=cookie('Synthetic-Session-From-A-Different-Owned-Database');assert.equal((await context(old)).status,401);const page=await fetch(url+'/',{headers:{Cookie:old,'X-Role':'it'}});assert.equal(page.status,200);const current=replacement(page);assert.ok(current!==old);const view=await context(current);assert.equal(view.status,200);assert.equal(view.body.role,'executive');assert.equal((await context(old)).status,401);});

test('reference recovery: a valid executive cookie and CSRF material are retained',async()=>{const s=await app.identity.createSession(DEMO_EXECUTIVE);const page=await fetch(url+'/',{headers:{Cookie:cookie(s.token)}});assert.equal(page.status,200);assert.ok(page.headers.get('set-cookie')===null);assert.ok(await app.identity.validateCsrf(s.token,s.csrf,url,url));assert.equal((await context(cookie(s.token))).body.role,'executive');});

test('reference recovery: valid IT identity is retained without a business-role switch',async()=>{const s=await app.identity.createSession(itId);const page=await fetch(url+'/',{headers:{Cookie:cookie(s.token)}});assert.equal(page.status,200);assert.ok(page.headers.get('set-cookie')===null);assert.equal((await context(cookie(s.token))).body.role,'it');assert.equal((await fetch(url+'/v1/overview',{headers:{Cookie:cookie(s.token)}})).status,403);});

for(const kind of ['idle','absolute'] as const){test(`reference recovery: ${kind}-expired session is replaced only at the reference entry`,async()=>{const s=await app.identity.createSession(DEMO_EXECUTIVE),old=cookie(s.token);await db.query(kind==='idle'?'UPDATE auth_session SET last_seen_at=$2 WHERE token_hash=$1':'UPDATE auth_session SET expires_at=$2 WHERE token_hash=$1',[digest(s.token),new Date(Date.now()-3600000)]);assert.equal((await context(old)).status,401);const page=await fetch(url+'/',{headers:{Cookie:old}});const current=replacement(page);assert.equal((await context(current)).status,200);assert.equal((await context(old)).status,401);});}

test('reference recovery: logged-out token is not revived when a new demo session is created',async()=>{const s=await app.identity.createSession(DEMO_EXECUTIVE);await app.identity.logoutSession(s.token);const prior=(await db.query('SELECT revoked_at FROM auth_session WHERE token_hash=$1',[digest(s.token)])).rows[0].revoked_at;const page=await fetch(url+'/',{headers:{Cookie:cookie(s.token)}});assert.equal((await context(replacement(page))).status,200);assert.equal((await context(cookie(s.token))).status,401);const after=(await db.query('SELECT revoked_at FROM auth_session WHERE token_hash=$1',[digest(s.token)])).rows[0].revoked_at;assert.equal(String(after),String(prior));});

test('reference recovery: APIs, assets, POST and rejected hosts cannot mint a replacement session',async()=>{const headers={Cookie:cookie('Synthetic-Unknown-Session')};for(const route of ['/v1/context','/v1/overview','/app.js','/style.css','/it']){const r=await fetch(url+route,{headers});assert.ok(r.headers.get('set-cookie')===null);if(route.startsWith('/v1/'))assert.equal(r.status,401);}const post=await fetch(url+'/',{method:'POST',headers});assert.equal(post.status,405);assert.ok(post.headers.get('set-cookie')===null);const denied=await new Promise<{status:number;hasCookie:boolean}>((resolve,reject)=>{const req=request(url+'/',{headers:{...headers,Host:'outside.invalid'}},res=>{res.resume();res.once('end',()=>resolve({status:res.statusCode!,hasCookie:Boolean(res.headers['set-cookie'])}));});req.once('error',reject);req.end();});assert.equal(denied.status,403);assert.equal(denied.hasCookie,false);});

test('reference recovery: identity-storage errors fail closed rather than issuing fallback credentials',async()=>{const authenticate=app.identity.authenticate.bind(app.identity);app.identity.authenticate=async()=>{throw Error('Synthetic identity storage failure');};try{const page=await fetch(url+'/',{headers:{Cookie:cookie('Synthetic-Unknown-Session')}});assert.equal(page.status,500);assert.ok(page.headers.get('set-cookie')===null);}finally{app.identity.authenticate=authenticate;}});

test('reference recovery: a disabled demo principal cannot acquire a fresh session',async()=>{await db.query('UPDATE principal SET disabled=true WHERE id=$1',[DEMO_EXECUTIVE]);try{const page=await fetch(url+'/',{headers:{Cookie:cookie('Synthetic-Unknown-Session')}});assert.equal(page.status,500);assert.ok(page.headers.get('set-cookie')===null);}finally{await db.query('UPDATE principal SET disabled=false WHERE id=$1',[DEMO_EXECUTIVE]);}});
