// Read-only native upgrade plan; never starts a migration or service.
// 只读原生升级规划，不开始迁移或启停服务。
import {planNativeUpgrade} from '../src/enterprise/native-upgrade-plan.ts';
try{const a=process.argv.slice(2);if(a.length!==4||a[0]!=='--input'||a[2]!=='--out')throw Error('native_upgrade_usage_invalid');const r=await planNativeUpgrade(a[1],a[3]);console.log(JSON.stringify({status:r.status,appendedMigrations:r.static.appendedMigrations.length,credentialsRead:false,databaseChecked:false,canCutover:false}));}catch(e){console.error(JSON.stringify({code:/^(native_upgrade|upgrade|release)_[a-z_]{1,100}$/.test(e?.message??'')?e.message:'native_upgrade_plan_refused'}));process.exitCode=1;}
