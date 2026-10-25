// Explicit runtime-only read review; no DBA input or migration.
// 显式运行账号只读核对，不接受DBA输入或执行迁移。
import {reviewNativeUpgradeRuntime} from '../src/enterprise/native-upgrade-runtime-review.ts';
try{const a=process.argv.slice(2);if(a.length!==4||a[0]!=='--input'||a[2]!=='--out')throw Error('native_upgrade_review_usage_invalid');const r=await reviewNativeUpgradeRuntime(a[1],a[3]);console.log(JSON.stringify({status:r.status,currentSchema:r.databaseReview.currentSchema,canCutover:false,privilegedConnectionOpened:false}));}catch(e){console.error(JSON.stringify({code:/^(native_upgrade|native_runtime|upgrade|release)_[a-z_]{1,100}$/.test(e?.message??'')?e.message:'native_upgrade_runtime_review_refused'}));process.exitCode=1;}
